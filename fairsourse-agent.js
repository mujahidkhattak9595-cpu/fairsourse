#!/usr/bin/env node
/**
 * Fairsourse agent. Node 18+, no dependencies.
 *
 *   node fairsourse-agent.js feed      build products.json (AliExpress API + optional temu.csv), track price history
 *   node fairsourse-agent.js post      pick top deals, write captions, post to channels
 *   node fairsourse-agent.js run       feed, then post (default)
 *   add --dry-run to log everything and post nothing
 *
 * Files it reads/writes in the working folder:
 *   products.json  -> paste into the site: Admin panel > Import feed
 *   history.json   -> price history per product
 *   state.json     -> what was posted and when (prevents reposting inside the cooldown)
 *   manual-queue.txt -> captions for channels you have not connected yet (TikTok, YouTube, and any with missing keys)
 *   temu.csv (optional) -> header: name,category,price,orig,sold,url   (Temu has no open product API; export from your Temu affiliate portal)
 *
 * Env vars
 *   AliExpress: ALI_APP_KEY, ALI_APP_SECRET, ALI_TRACKING_ID
 *   Captions:   ANTHROPIC_API_KEY (optional; a template is used without it), CAPTION_MODEL (default claude-sonnet-5-5)
 *   Facebook:   FB_PAGE_ID, FB_PAGE_TOKEN
 *   Instagram:  IG_USER_ID, IG_TOKEN  (Business account; the image must be a public URL)
 *   Tuning:     MAX_POSTS=3  PER_CATEGORY=4  COOLDOWN_DAYS=14  MIN_DISCOUNT=30
 *
 * Verify every endpoint and field below against the current official docs before relying on it.
 * Run on a server or scheduler. Never put these keys in the web page.
 */
const crypto = require("crypto");
const fs = require("fs");

const E = process.env;
const ARGS = process.argv.slice(2);
const CMD = ARGS.find(a => !a.startsWith("--")) || "run";
const DRY = ARGS.includes("--dry-run");
const CFG = {
  maxPosts: +E.MAX_POSTS || 3,
  perCategory: +E.PER_CATEGORY || 4,
  cooldownDays: +E.COOLDOWN_DAYS || 14,
  minDiscount: +E.MIN_DISCOUNT || 30,
  model: E.CAPTION_MODEL || "claude-sonnet-5-5",
};
const CATEGORIES = {
  Kitchen: "kitchen gadgets", Beauty: "beauty tools", Gym: "home gym", Car: "car accessories",
  Home: "home decor", Fashion: "fashion accessories", Tech: "tech gadgets",
};
const EMOJI = { Kitchen: "🍳", Beauty: "💄", Gym: "🏋️", Car: "🚗", Home: "🏠", Fashion: "👜", Tech: "🎧" };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2));
const log = (...a) => console.log(new Date().toISOString(), ...a);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

// HTTP with retry and backoff on rate limits and server errors
async function http(url, opts = {}, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, opts);
      if ((r.status === 429 || r.status >= 500) && i < tries) { await sleep(1000 * 2 ** i); continue; }
      return r;
    } catch (e) {
      if (i === tries) throw e;
      await sleep(1000 * 2 ** i);
    }
  }
}
async function json(url, opts) {
  const r = await http(url, opts);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${url.split("?")[0]} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

// ---------- 1. Feed ----------
function sign(params, secret) {
  const base = Object.keys(params).sort().map(k => k + params[k]).join("");
  return crypto.createHmac("sha256", secret).update(base).digest("hex").toUpperCase();
}
async function aliQuery(keywords) {
  const p = {
    app_key: E.ALI_APP_KEY, timestamp: Date.now().toString(), sign_method: "sha256",
    method: "aliexpress.affiliate.product.query", keywords, tracking_id: E.ALI_TRACKING_ID,
    target_currency: "USD", target_language: "EN", page_size: "20", sort: "LAST_VOLUME_DESC",
  };
  p.sign = sign(p, E.ALI_APP_SECRET);
  const j = await json("https://api-sg.aliexpress.com/sync?" + new URLSearchParams(p));
  return j?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product || [];
}
async function aliItems() {
  if (!E.ALI_APP_KEY || !E.ALI_APP_SECRET || !E.ALI_TRACKING_ID) { log("AliExpress keys missing, skipping API feed"); return []; }
  const out = [];
  for (const [category, kw] of Object.entries(CATEGORIES)) {
    try {
      let n = 0;
      for (const x of await aliQuery(kw)) {
        const price = parseFloat(x.target_sale_price), orig = parseFloat(x.target_original_price);
        if (!(price > 0 && orig > price) || n >= CFG.perCategory) continue;
        out.push({
          id: "ali-" + x.product_id, name: x.product_title.slice(0, 80), category, emoji: EMOJI[category],
          price, orig, sold: parseInt(x.lastest_volume) || 0, store: "ali",
          url: x.promotion_link, image: x.product_main_image_url || "", // promotion_link carries your tracking
        });
        n++;
      }
      log(category, "ali items:", n);
    } catch (e) { log("AliExpress", category, "failed:", e.message); }
    await sleep(600); // stay under rate limits
  }
  return out;
}
function temuItems() {
  if (!fs.existsSync("temu.csv")) return [];
  const [head, ...rows] = fs.readFileSync("temu.csv", "utf8").trim().split(/\r?\n/);
  const cols = head.split(",").map(s => s.trim()); // simple CSV: no commas inside values
  return rows.map(r => {
    const v = r.split(","), o = Object.fromEntries(cols.map((c, i) => [c, (v[i] || "").trim()]));
    return {
      id: "temu-" + slug(o.name), name: o.name.slice(0, 80), category: o.category, emoji: EMOJI[o.category] || "🛍️",
      price: parseFloat(o.price), orig: parseFloat(o.orig), sold: parseInt(o.sold) || 0, store: "temu", url: o.url, image: "",
    };
  }).filter(p => p.name && CATEGORIES[p.category] && p.price > 0 && p.orig > p.price && /^https:\/\//.test(p.url));
}
function trackHistory(items) {
  const hist = readJson("history.json", {});
  for (const p of items) {
    const h = (hist[p.id] ||= []);
    const last = h[h.length - 1];
    p.priceDrop = last && p.price < last.price ? Math.round((1 - p.price / last.price) * 100) : 0;
    if (!last || last.price !== p.price) h.push({ t: Date.now(), price: p.price });
    if (h.length > 60) h.splice(0, h.length - 60);
  }
  writeJson("history.json", hist);
}
async function buildFeed() {
  const items = [...(await aliItems()), ...temuItems()]
    .filter(p => Math.round((1 - p.price / p.orig) * 100) >= CFG.minDiscount);
  if (!items.length) { log("No items built; keeping the existing products.json"); return; }
  trackHistory(items);
  writeJson("products.json", items);
  log("products.json written:", items.length, "items");
}

// ---------- 2. Captions ----------
function template(p) {
  return `${p.emoji} ${p.name} for $${p.price.toFixed(2)} with free worldwide shipping! #viral #gadgets #ad`;
}
async function caption(p) {
  let text = template(p);
  if (E.ANTHROPIC_API_KEY) {
    try {
      const j = await json("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": E.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: CFG.model, max_tokens: 200,
          messages: [{ role: "user", content:
            `Write one upbeat English social caption, max 220 characters, with 3 hashtags, for this product: "${p.name}", price $${p.price}.` +
            ` Use only these facts. Do not invent specs, reviews or claims. Output the caption only.` }],
        }),
      });
      const t = (j?.content?.[0]?.text || "").trim();
      if (t.length > 20) text = t;
    } catch (e) { log("Caption API failed, using template:", e.message); }
  }
  text = text.slice(0, 260).trim();
  if (!/#ad\b/i.test(text)) text += " #ad"; // affiliate disclosure on every post
  return text;
}

// ---------- 3. Channels ----------
const channels = [
  { name: "Facebook", ready: () => E.FB_PAGE_ID && E.FB_PAGE_TOKEN,
    post: (text, p) => json(`https://graph.facebook.com/v21.0/${E.FB_PAGE_ID}/feed`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ message: text, link: p.url, access_token: E.FB_PAGE_TOKEN }) }) },
  { name: "Instagram", ready: () => E.IG_USER_ID && E.IG_TOKEN,
    post: async (text, p) => {
      if (!/^https:\/\//.test(p.image || "")) throw new Error("no public image_url for this product");
      const c = await json(`https://graph.facebook.com/v21.0/${E.IG_USER_ID}/media`, {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ image_url: p.image, caption: text + "\nLink in bio", access_token: E.IG_TOKEN }) });
      await sleep(3000); // let Instagram finish processing the image
      return json(`https://graph.facebook.com/v21.0/${E.IG_USER_ID}/media_publish`, {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ creation_id: c.id, access_token: E.IG_TOKEN }) });
    } },
  // TikTok (Content Posting API) and YouTube (videos.insert) need a rendered video, OAuth and app review/audit.
  // Add them here as { name, ready, post } once you have approval and a video generator.
  // Until then everything below goes to manual-queue.txt.
  { name: "TikTok", ready: () => false, post: async () => {} },
  { name: "YouTube", ready: () => false, post: async () => {} },
];
function queueManual(channel, text, p) {
  fs.appendFileSync("manual-queue.txt", `[${new Date().toISOString().slice(0, 10)}] ${channel}: ${text} ${p.url}\n`);
}

// ---------- 4. Pick and post ----------
function pick(items, state) {
  const now = Date.now(), cool = CFG.cooldownDays * 864e5;
  return items
    .filter(p => !state.posted[p.id] || now - state.posted[p.id] > cool)
    .map(p => ({ p, score: p.sold * (1 + (p.priceDrop || 0) / 20) * (1 - p.price / p.orig + 0.5) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CFG.maxPosts)
    .map(x => x.p);
}
async function postTop() {
  const items = readJson("products.json", []);
  if (!items.length) { log("products.json is empty; run the feed first"); return; }
  const state = readJson("state.json", { posted: {} });
  for (const p of pick(items, state)) {
    const text = await caption(p);
    log("Product:", p.name, "\n  Caption:", text);
    if (DRY) continue;
    for (const ch of channels) {
      if (!ch.ready()) { queueManual(ch.name, text, p); continue; }
      try { await ch.post(text, p); log("  Posted to", ch.name); }
      catch (e) { log("  ", ch.name, "failed:", e.message); queueManual(ch.name, text, p); }
      await sleep(1500);
    }
    state.posted[p.id] = Date.now();
    writeJson("state.json", state);
  } 
}

// ---------- Main ----------
const commands = { feed: buildFeed, post: postTop, run: async () => { await buildFeed(); await postTop(); } }; 
if (!commands[CMD]) { console.error("Usage: node fairsourse-agent.js [feed|post|run] [--dry-run]"); process.exit(1); }
commands[CMD]().catch(e => { console.error(e); process.exit(1); });
