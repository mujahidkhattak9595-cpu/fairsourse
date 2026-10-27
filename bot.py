import os
import requests
import random

BOT_TOKEN = os.getenv("BOT_TOKEN")
CHANNEL_ID = os.getenv("CHANNEL_ID")

def send_message(text):
    if not BOT_TOKEN or not CHANNEL_ID:
        print("ERROR: BOT_TOKEN or CHANNEL_ID")
        return
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = {
        "chat_id": CHANNEL_ID,
        "text": text,
        "parse_mode": "HTML"
    }
    r = requests.post(url, data=data)
    print(f"Telegram Response: {r.text}")

PRODUCTS = [
    "🔥 Wireless Earbuds Bluetooth 5.3\n💰 Price: $9.99\n\nBest Quality | Free Shipping\n\n🛒 Order Now: https://s.click.aliexpress.com/e/_DD5zKzJ",
    "🔥 Car Phone Holder 360 Rotation\n💰 Price: $3.49\n\n4.8 Rating | Trending\n\n🛒 Order Now: https://s.click.aliexpress.com/e/_DD5zKzJ",
    "🔥 LED Strip Lights Room Decoration\n💰 Price: $5.99\n\nBest Seller\n\n🛒 Order Now: https://s.click.aliexpress.com/e/_DD5zKzJ",
    "🔥 Water Bottle Steel 1L - Hot & Cold\n💰 Price: $7.49\n\nBest Price Today\n\n🛒 Order Now: https://s.click.aliexpress.com/e/_DD5zKzJ",
    "🔥 Attar Perfume Alcohol Free - Long Lasting\n💰 Price: $8.99\n\nBest Fragrance\n\n🛒 Order Now: https://s.click.aliexpress.com/e/_DD5zKzJ"
]

message = random.choice(PRODUCTS)
send_message(message)
