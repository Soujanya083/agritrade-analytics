"""
MongoDB connection shared by all analytics routes.
"""

import os

import dns.resolver
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

# mongodb+srv:// URIs need DNS SRV lookups, which some home/college networks
# block. By default we use reliable public resolvers (kept from the original
# setup); set MONGO_USE_PUBLIC_DNS=false to use the system resolver instead
# (e.g. inside a private network / corporate DNS).
if os.getenv("MONGO_USE_PUBLIC_DNS", "true").strip().lower() not in {"0", "false", "no"}:
    resolver = dns.resolver.Resolver(configure=False)
    resolver.nameservers = ["8.8.8.8", "1.1.1.1"]
    resolver.timeout = 5
    resolver.lifetime = 15

    dns.resolver.default_resolver = resolver


MONGO_URI = os.getenv(
    "MONGO_URI",
    "mongodb://localhost:27017/agribid"
)

client = MongoClient(
    MONGO_URI,
    serverSelectionTimeoutMS=10000,
    connectTimeoutMS=10000
)

db = client.get_default_database()


# Collections
crops_collection = db["crops"]
bids_collection = db["bids"]
transactions_collection = db["transactions"]
users_collection = db["users"]
# REAL market data imported from AGMARKNET (see scripts/import_mandi_prices.py)
mandi_prices_collection = db["mandi_prices"]


def get_db():
    return db