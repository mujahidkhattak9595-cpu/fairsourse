import random
HARAM_KEYWORDS = ["pork", "bacon", "alcohol", "wine", "beer", "sex", "lingerie", "casino"]
PRODUCTS = [
    {"title": "Men Cotton T-Shirt", "price": "$8.99", "link": "https://s.click.aliexpress.com/e/_YOURCODE"},
    {"title": "Wall Paint Brush Set", "price": "$5.50", "link": "https://s.click.aliexpress.com/e/_YOURCODE"},
]
def is_halal(title):
    t=title.lower()
    for w in HARAM_KEYWORDS:
        if w in t: return False
    return True
for p in PRODUCTS:
    if is_halal(p['title']):
        print(f"Best Deal! {p['title']} only {p['price']} Shop: {p['link']}")
