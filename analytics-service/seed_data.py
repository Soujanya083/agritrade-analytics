"""
Seeds realistic crops/bids/transactions so the analytics endpoints
have something meaningful to compute. Safe to run multiple times
against a dev DB — it creates its own tagged test users/crops.

Usage:
    cd analytics-service
    python seed_data.py                # default: 270 days of history
    python seed_data.py --days 365     # override the history window

Requires MONGO_URI in .env (same DB your Node server uses).

Why 270 days instead of 45:
Walk-forward backtesting, SHAP explainability, and decision scoring
all need multiple non-overlapping train/test folds to say anything
meaningful. With a 7-day horizon, 45 days barely supports a single
fold (min_train_size ~14, so maybe 4 folds at best, all crammed into
one short season). 270 days (~9 months) gives ~15-20 usable folds per
crop and enough span to cover more than one point in a seasonal cycle,
so "Insufficient Data" stops showing up and the backtest numbers in
your report are drawn from a genuine multi-fold average instead of
1-2 folds.
"""
import argparse
import os
import random
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from pymongo import MongoClient
import bcrypt
import requests

load_dotenv()
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/agribid")
client = MongoClient(MONGO_URI)
db = client.get_default_database()

# Optional: if set, seeded crops get a real photo instead of falling back
# to the frontend's hand-drawn icon. Sign up free at pexels.com/api,
# no cost, ~instant approval. If unset, imageUrl is left blank and the
# frontend's existing icon fallback kicks in exactly as before -
# this is purely additive, nothing breaks without it.
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")

CROPS = [
    # Grains & pulses (kept under "Grains" - your app's dropdown only
    # offers Grains/Vegetables/Fruits, so pulses group here rather than
    # under a category the UI can't actually filter by)
    "Wheat", "Rice", "Maize", "Bajra", "Jowar", "Ragi", "Barley",
    "Chana", "Toor Dal", "Moong", "Urad", "Masoor", "Soybean",
    # Vegetables
    "Tomato", "Onion", "Potato", "Carrot", "Cabbage", "Brinjal", "Cauliflower",
    "Spinach", "Okra", "Green Chilli", "Capsicum", "Cucumber", "Beetroot",
    "Radish", "Peas", "Garlic", "Ginger", "Pumpkin", "Bottle Gourd",
    "Bitter Gourd", "Turnip", "Cluster Beans", "Ridge Gourd",
    # Fruits
    "Mango", "Banana", "Grapes", "Apple", "Orange", "Papaya", "Watermelon",
    "Pomegranate", "Guava", "Pineapple", "Sapota", "Lemon",
    "Custard Apple", "Litchi",
]
LOCATIONS = ["Pune", "Nashik", "Nagpur"]
CATEGORIES = {
    # Grains & pulses
    "Wheat": "Grains", "Rice": "Grains", "Maize": "Grains", "Bajra": "Grains",
    "Jowar": "Grains", "Ragi": "Grains", "Barley": "Grains",
    "Chana": "Grains", "Toor Dal": "Grains", "Moong": "Grains",
    "Urad": "Grains", "Masoor": "Grains", "Soybean": "Grains",
    # Vegetables
    "Tomato": "Vegetables", "Onion": "Vegetables", "Potato": "Vegetables",
    "Carrot": "Vegetables", "Cabbage": "Vegetables", "Brinjal": "Vegetables",
    "Cauliflower": "Vegetables", "Spinach": "Vegetables", "Okra": "Vegetables",
    "Green Chilli": "Vegetables", "Capsicum": "Vegetables",
    "Cucumber": "Vegetables", "Beetroot": "Vegetables", "Radish": "Vegetables",
    "Peas": "Vegetables", "Garlic": "Vegetables", "Ginger": "Vegetables",
    "Pumpkin": "Vegetables", "Bottle Gourd": "Vegetables",
    "Bitter Gourd": "Vegetables", "Turnip": "Vegetables",
    "Cluster Beans": "Vegetables", "Ridge Gourd": "Vegetables",
    # Fruits
    "Mango": "Fruits", "Banana": "Fruits", "Grapes": "Fruits",
    "Apple": "Fruits", "Orange": "Fruits", "Papaya": "Fruits",
    "Watermelon": "Fruits", "Pomegranate": "Fruits", "Guava": "Fruits",
    "Pineapple": "Fruits", "Sapota": "Fruits", "Lemon": "Fruits",
    "Custard Apple": "Fruits", "Litchi": "Fruits",
}
# Rough Indian wholesale/mandi price ranges, INR per kg.
BASE_PRICE_RANGE = {
    # Grains & pulses - pulses price much higher than cereals (dry, dehusked)
    "Wheat": (18, 24), "Rice": (30, 40), "Maize": (15, 22), "Bajra": (20, 28),
    "Jowar": (22, 30), "Ragi": (25, 35), "Barley": (20, 28),
    "Chana": (55, 75), "Toor Dal": (90, 120), "Moong": (85, 110),
    "Urad": (90, 115), "Masoor": (70, 95), "Soybean": (35, 45),
    # Vegetables
    "Tomato": (10, 20), "Onion": (12, 22), "Potato": (8, 15),
    "Carrot": (15, 25), "Cabbage": (8, 15), "Brinjal": (12, 20),
    "Cauliflower": (10, 18), "Spinach": (10, 18), "Okra": (20, 30),
    "Green Chilli": (25, 40), "Capsicum": (30, 45), "Cucumber": (10, 18),
    "Beetroot": (15, 22), "Radish": (8, 14), "Peas": (30, 45),
    "Garlic": (60, 90), "Ginger": (50, 80), "Pumpkin": (8, 14),
    "Bottle Gourd": (8, 15), "Bitter Gourd": (20, 30), "Turnip": (10, 16),
    "Cluster Beans": (25, 38), "Ridge Gourd": (12, 20),
    # Fruits
    "Mango": (40, 80), "Banana": (15, 25), "Grapes": (35, 60),
    "Apple": (80, 130), "Orange": (30, 50), "Papaya": (15, 25),
    "Watermelon": (8, 15), "Pomegranate": (60, 100), "Guava": (25, 40),
    "Pineapple": (20, 35), "Sapota": (30, 45), "Lemon": (40, 70),
    "Custard Apple": (50, 80), "Litchi": (70, 110),
}

# Rough seasonal amplitude (fraction of base price) and phase (day-of-year
# offset, in days) per crop, so the series has an actual pattern for
# backtesting/SHAP to pick up on instead of pure noise + linear drift.
# Grains/pulses stay comparatively flat (harvested once or twice a year,
# price moves gradually); vegetables and fruits tied to a short harvest
# window swing hardest - phase_days roughly targets each crop's real
# harvest/price-spike season in India.
SEASONALITY = {
    # Grains & pulses
    "Wheat":     {"amplitude": 0.05, "phase_days": 100},  # Rabi harvest, Mar-Apr
    "Rice":      {"amplitude": 0.06, "phase_days": 140},  # Kharif harvest, Oct-Nov
    "Maize":     {"amplitude": 0.12, "phase_days": 250},  # Kharif, Aug-Oct
    "Bajra":     {"amplitude": 0.10, "phase_days": 260},  # Kharif, Sep-Oct
    "Jowar":     {"amplitude": 0.10, "phase_days": 270},  # Kharif/Rabi mix
    "Ragi":      {"amplitude": 0.08, "phase_days": 275},
    "Barley":    {"amplitude": 0.06, "phase_days": 90},   # Rabi, Mar
    "Chana":     {"amplitude": 0.10, "phase_days": 80},   # Rabi harvest, Feb-Mar
    "Toor Dal":  {"amplitude": 0.12, "phase_days": 330},  # harvest Dec-Jan
    "Moong":     {"amplitude": 0.10, "phase_days": 200},  # Kharif, Sep
    "Urad":      {"amplitude": 0.10, "phase_days": 205},
    "Masoor":    {"amplitude": 0.10, "phase_days": 85},
    "Soybean":   {"amplitude": 0.15, "phase_days": 280},  # Kharif, Oct
    # Vegetables
    "Tomato":         {"amplitude": 0.20, "phase_days": 180},  # monsoon spike
    "Onion":          {"amplitude": 0.25, "phase_days": 200},  # monsoon spike
    "Potato":         {"amplitude": 0.12, "phase_days": 60},
    "Carrot":         {"amplitude": 0.15, "phase_days": 330},  # winter crop
    "Cabbage":        {"amplitude": 0.15, "phase_days": 340},  # winter crop
    "Brinjal":        {"amplitude": 0.10, "phase_days": 150},  # fairly year-round
    "Cauliflower":    {"amplitude": 0.18, "phase_days": 335},  # winter crop
    "Spinach":        {"amplitude": 0.15, "phase_days": 350},  # winter leafy green
    "Okra":           {"amplitude": 0.15, "phase_days": 170},  # summer/monsoon
    "Green Chilli":   {"amplitude": 0.20, "phase_days": 190},
    "Capsicum":       {"amplitude": 0.15, "phase_days": 160},
    "Cucumber":       {"amplitude": 0.18, "phase_days": 130},  # summer
    "Beetroot":       {"amplitude": 0.12, "phase_days": 325},
    "Radish":         {"amplitude": 0.12, "phase_days": 340},
    "Peas":           {"amplitude": 0.20, "phase_days": 345},  # winter
    "Garlic":         {"amplitude": 0.15, "phase_days": 90},   # Rabi, Mar harvest
    "Ginger":         {"amplitude": 0.20, "phase_days": 270},  # harvested Nov-Jan
    "Pumpkin":        {"amplitude": 0.10, "phase_days": 200},
    "Bottle Gourd":   {"amplitude": 0.10, "phase_days": 150},
    "Bitter Gourd":   {"amplitude": 0.12, "phase_days": 160},
    "Turnip":         {"amplitude": 0.13, "phase_days": 335},
    "Cluster Beans":  {"amplitude": 0.15, "phase_days": 175},
    "Ridge Gourd":    {"amplitude": 0.10, "phase_days": 155},
    # Fruits - strongest seasonality, tied to a short harvest window
    "Mango":         {"amplitude": 0.30, "phase_days": 120},  # summer peak, Apr-Jun
    "Banana":        {"amplitude": 0.08, "phase_days": 180},  # available ~year-round
    "Grapes":        {"amplitude": 0.25, "phase_days": 30},   # winter harvest, Nashik
    "Apple":         {"amplitude": 0.20, "phase_days": 270},  # Sep-Nov harvest
    "Orange":        {"amplitude": 0.18, "phase_days": 340},  # winter, Nagpur oranges
    "Papaya":        {"amplitude": 0.10, "phase_days": 160},
    "Watermelon":    {"amplitude": 0.25, "phase_days": 110},  # summer, Apr-May
    "Pomegranate":   {"amplitude": 0.20, "phase_days": 250},  # Sep-Nov
    "Guava":         {"amplitude": 0.15, "phase_days": 300},  # winter main season
    "Pineapple":     {"amplitude": 0.15, "phase_days": 170},  # summer
    "Sapota":        {"amplitude": 0.12, "phase_days": 200},
    "Lemon":         {"amplitude": 0.18, "phase_days": 140},  # summer demand peak
    "Custard Apple": {"amplitude": 0.25, "phase_days": 260},  # Aug-Oct, Sitaphal season
    "Litchi":        {"amplitude": 0.30, "phase_days": 130},  # short window, May-Jun
}

random.seed(42)
hashed_pw = bcrypt.hashpw(b"password123", bcrypt.gensalt()).decode()


def fetch_crop_images():
    """
    One Pexels search per crop type (5 calls total, not per-listing),
    so every seeded Tomato listing shares one real tomato photo, every
    seeded Onion listing shares one real onion photo, etc. Well under
    Pexels' free-tier limit (200/hour) even if you re-run this often.
    Returns {} (i.e. no images) if PEXELS_API_KEY isn't set or a call
    fails - seeding still works, listings just fall back to icons
    exactly like before.
    """
    if not PEXELS_API_KEY:
        print("PEXELS_API_KEY not set - skipping real photos, "
              "seeded crops will use the existing icon fallback.")
        return {}

    images = {}
    for crop in CROPS:
        try:
            resp = requests.get(
                "https://api.pexels.com/v1/search",
                headers={"Authorization": PEXELS_API_KEY},
                params={"query": f"{crop} vegetable farm", "per_page": 1},
                timeout=5,
            )
            resp.raise_for_status()
            photos = resp.json().get("photos", [])
            if photos:
                # 'medium' is plenty for a listing card and keeps page
                # weight down vs. the full-resolution original.
                images[crop] = photos[0]["src"]["medium"]
                print(f"  {crop}: got real photo from Pexels")
            else:
                print(f"  {crop}: no Pexels result, will use icon fallback")
        except requests.RequestException as error:
            print(f"  {crop}: Pexels request failed ({error}), "
                  f"will use icon fallback")
    return images


def make_users():
    farmers, buyers = [], []
    for i in range(6):
        loc = LOCATIONS[i % len(LOCATIONS)]
        farmers.append({
            "role": "Farmer", "fullName": f"Seed Farmer {i+1}",
            "email": f"seed.farmer{i+1}@test.com", "phone": f"90000000{i:02d}",
            "location": loc, "isVerified": True, "password": hashed_pw,
            "createdAt": datetime.now(timezone.utc), "updatedAt": datetime.now(timezone.utc),
        })
    for i in range(10):
        loc = LOCATIONS[i % len(LOCATIONS)]
        buyers.append({
            "role": "Buyer", "fullName": f"Seed Buyer {i+1}",
            "email": f"seed.buyer{i+1}@test.com", "phone": f"91000000{i:02d}",
            "location": loc, "deliveryAddress": f"{loc} warehouse road",
            "isVerified": True, "password": hashed_pw,
            "createdAt": datetime.now(timezone.utc), "updatedAt": datetime.now(timezone.utc),
        })
    farmer_ids = db["users"].insert_many(farmers).inserted_ids
    buyer_ids = db["users"].insert_many(buyers).inserted_ids
    print(f"Inserted {len(farmer_ids)} seed farmers, {len(buyer_ids)} seed buyers")
    return farmer_ids, buyer_ids


def make_crops_bids_transactions(farmer_ids, buyer_ids, history_days, crop_images):
    import math

    crops_docs, bids_docs, tx_docs = [], [], []
    start_date = datetime.now(timezone.utc) - timedelta(days=history_days)

    for day_offset in range(history_days):
        day = start_date + timedelta(days=day_offset)
        for _ in range(random.randint(1, 3)):
            crop_name = random.choice(CROPS)
            location = random.choice(LOCATIONS)
            lo, hi = BASE_PRICE_RANGE[crop_name]
            mid = (lo + hi) / 2

            # Gentle long-run drift (inflation-ish), much smaller than
            # before so a 270-day run doesn't drift the price to
            # absurd multiples of where it started.
            drift = day_offset * 0.01

            # Seasonal component: a full sine cycle every 365 days,
            # phase-shifted per crop so peaks land in different months.
            season = SEASONALITY[crop_name]
            seasonal_component = mid * season["amplitude"] * math.sin(
                2 * math.pi * (day_offset + season["phase_days"]) / 365
            )

            noise = random.uniform(-0.4, 0.4)
            base_price = round(
                max(1.0, random.uniform(lo, hi) + drift + seasonal_component + noise),
                2,
            )
            current_bid = round(base_price * random.uniform(1.0, 1.25), 2)
            farmer_id = random.choice(farmer_ids)

            crop_doc = {
                "farmerId": farmer_id, "cropName": crop_name,
                "variety": "Standard", "quantityKg": random.randint(100, 2000),
                "location": location,
                "harvestedDate": day.strftime("%Y-%m-%d"),
                "basePrice": base_price, "currentBid": current_bid,
                "category": CATEGORIES[crop_name],
                "imageUrl": crop_images.get(crop_name),
                "status": random.choices(["open", "deal_done", "completed"],
                                          weights=[0.3, 0.2, 0.5])[0],
                "createdAt": day, "updatedAt": day,
            }
            crop_id = db["crops"].insert_one(crop_doc).inserted_id

            num_bids = random.randint(0, 4)
            winning_bid_id = None
            for b in range(num_bids):
                bid_amount = round(current_bid * random.uniform(0.95, 1.1), 2)
                bid_time = day + timedelta(hours=random.randint(1, 20))
                bid_doc = {
                    "cropId": crop_id, "buyerId": random.choice(buyer_ids),
                    "amount": bid_amount,
                    "status": "active",
                    "createdAt": bid_time, "updatedAt": bid_time,
                }
                bid_id = db["bids"].insert_one(bid_doc).inserted_id
                if b == num_bids - 1:
                    winning_bid_id = (bid_id, bid_doc["buyerId"], bid_amount)

            if crop_doc["status"] == "completed" and winning_bid_id:
                bid_id, buyer_id, amount = winning_bid_id
                fee = round(amount * 0.05, 2)
                tx_doc = {
                    "cropId": crop_id, "bidId": bid_id,
                    "farmerId": farmer_id, "buyerId": buyer_id,
                    "totalAmount": amount, "platformFee": fee,
                    "payout": round(amount - fee, 2),
                    "status": "delivery_completed",
                    "paymentProvider": "razorpay",
                    "paymentDate": (day + timedelta(days=1)).strftime("%m/%d/%Y"),
                    "dispatchedDate": (day + timedelta(days=2)).strftime("%m/%d/%Y"),
                    "completedDate": (day + timedelta(days=4)).strftime("%m/%d/%Y"),
                    "createdAt": day, "updatedAt": day,
                }
                db["transactions"].insert_one(tx_doc)

    print(f"Seeded crops, bids, and transactions across {history_days} days.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--days", type=int, default=270,
        help="How many days of history to generate (default: 270)."
    )
    args = parser.parse_args()

    print(f"Connecting to {MONGO_URI} ...")
    print("Fetching real crop photos from Pexels...")
    crop_images = fetch_crop_images()
    farmer_ids, buyer_ids = make_users()
    make_crops_bids_transactions(farmer_ids, buyer_ids, args.days, crop_images)
    print("\nDone. You can now hit the analytics endpoints and see real results.")
    print("To wipe this seed data later, delete users/crops/bids/transactions")
    print(f"where email starts with 'seed.' (users) or createdAt is in the last {args.days} days.")