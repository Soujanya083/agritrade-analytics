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
from datetime import datetime, timedelta
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

CROPS = ["Wheat", "Rice", "Tomato", "Onion", "Potato"]
LOCATIONS = ["Pune", "Nashik", "Nagpur"]
CATEGORIES = {"Wheat": "Grains", "Rice": "Grains", "Tomato": "Vegetables",
              "Onion": "Vegetables", "Potato": "Vegetables"}
BASE_PRICE_RANGE = {"Wheat": (18, 24), "Rice": (30, 40), "Tomato": (10, 20),
                     "Onion": (12, 22), "Potato": (8, 15)}

# Rough seasonal amplitude (fraction of base price) and phase (day-of-year
# offset, in days) per crop, so the series has an actual pattern for
# backtesting/SHAP to pick up on instead of pure noise + linear drift.
# Onion/Tomato spike around monsoon; grains are comparatively flat.
SEASONALITY = {
    "Wheat":  {"amplitude": 0.05, "phase_days": 100},
    "Rice":   {"amplitude": 0.06, "phase_days": 140},
    "Tomato": {"amplitude": 0.20, "phase_days": 180},
    "Onion":  {"amplitude": 0.25, "phase_days": 200},
    "Potato": {"amplitude": 0.12, "phase_days": 60},
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
            "createdAt": datetime.utcnow(), "updatedAt": datetime.utcnow(),
        })
    for i in range(10):
        loc = LOCATIONS[i % len(LOCATIONS)]
        buyers.append({
            "role": "Buyer", "fullName": f"Seed Buyer {i+1}",
            "email": f"seed.buyer{i+1}@test.com", "phone": f"91000000{i:02d}",
            "location": loc, "deliveryAddress": f"{loc} warehouse road",
            "isVerified": True, "password": hashed_pw,
            "createdAt": datetime.utcnow(), "updatedAt": datetime.utcnow(),
        })
    farmer_ids = db["users"].insert_many(farmers).inserted_ids
    buyer_ids = db["users"].insert_many(buyers).inserted_ids
    print(f"Inserted {len(farmer_ids)} seed farmers, {len(buyer_ids)} seed buyers")
    return farmer_ids, buyer_ids


def make_crops_bids_transactions(farmer_ids, buyer_ids, history_days, crop_images):
    import math

    crops_docs, bids_docs, tx_docs = [], [], []
    start_date = datetime.utcnow() - timedelta(days=history_days)

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