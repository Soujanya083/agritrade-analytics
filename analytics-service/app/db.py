"""
MongoDB connection shared by all analytics routes.
"""

import os

import dns.resolver
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

# Force dnspython/PyMongo to use reliable public DNS servers
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


def get_db():
    return db