"""
Seeds ~45 days of realistic crops/bids/transactions so the analytics
endpoints have something meaningful to compute. Safe to run multiple
times against a dev DB — it creates its own tagged test users/crops.

Usage:
    cd analytics-service
    python seed_data.py

Requires MONGO_URI in .env (same DB your Node server uses).
"""
import os
import random
from datetime import datetime, timedelta
from dotenv import load_dotenv
from pymongo import MongoClient
import bcrypt

load_dotenv()
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/agribid")
client = MongoClient(MONGO_URI)
db = client.get_default_database()

CROPS = ["Wheat", "Rice", "Tomato", "Onion", "Potato"]
LOCATIONS = ["Pune", "Nashik", "Nagpur"]
CATEGORIES = {"Wheat": "Grains", "Rice": "Grains", "Tomato": "Vegetables",
              "Onion": "Vegetables", "Potato": "Vegetables"}
BASE_PRICE_RANGE = {"Wheat": (18, 24), "Rice": (30, 40), "Tomato": (10, 20),
                     "Onion": (12, 22), "Potato": (8, 15)}

random.seed(42)
hashed_pw = bcrypt.hashpw(b"password123", bcrypt.gensalt()).decode()


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


def make_crops_bids_transactions(farmer_ids, buyer_ids):
    crops_docs, bids_docs, tx_docs = [], [], []
    start_date = datetime.utcnow() - timedelta(days=45)

    for day_offset in range(45):
        day = start_date + timedelta(days=day_offset)
        for _ in range(random.randint(1, 3)):
            crop_name = random.choice(CROPS)
            location = random.choice(LOCATIONS)
            lo, hi = BASE_PRICE_RANGE[crop_name]
            drift = day_offset * 0.03
            base_price = round(random.uniform(lo, hi) + drift, 2)
            current_bid = round(base_price * random.uniform(1.0, 1.25), 2)
            farmer_id = random.choice(farmer_ids)

            crop_doc = {
                "farmerId": farmer_id, "cropName": crop_name,
                "variety": "Standard", "quantityKg": random.randint(100, 2000),
                "location": location,
                "harvestedDate": day.strftime("%Y-%m-%d"),
                "basePrice": base_price, "currentBid": current_bid,
                "category": CATEGORIES[crop_name],
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

    print("Seeded crops, bids, and transactions across 45 days.")


if __name__ == "__main__":
    print(f"Connecting to {MONGO_URI} ...")
    farmer_ids, buyer_ids = make_users()
    make_crops_bids_transactions(farmer_ids, buyer_ids)
    print("\nDone. You can now hit the analytics endpoints and see real results.")
    print("To wipe this seed data later, delete users/crops/bids/transactions")
    print("where email starts with 'seed.' (users) or createdAt is in the last 45 days.")