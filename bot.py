import os
import requests

BOT_TOKEN = os.getenv("BOT_TOKEN")
CHANNEL_ID = os.getenv("CHANNEL_ID")

def send_message(text):
    if not BOT_TOKEN or not CHANNEL_ID:
        print("ERROR: BOT_TOKEN or CHANNEL_ID missing in Secrets!")
        return
    
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = {
        "chat_id": CHANNEL_ID,
        "text": text,
        "parse_mode": "HTML"
    }
    r = requests.post(url, data=data)
    print(f"Telegram Response: {r.text}")

# Test Post
message = """
🔥 <b>Halal Deals - Test Successful!</b> 🔥

Aapka Bot ab kaam kar raha hai!

✅ Bot.py Fixed
✅ CHANNEL_ID: @halal_deals_mk9595
✅ Admin: Done

Ab is main aapke Halal Products aayenge.
"""

send_message(message)
print("Done!")
