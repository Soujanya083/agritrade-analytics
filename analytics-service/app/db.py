"""
MongoDB connection shared by all analytics routes.
Connects to the SAME database your Node/Express server already uses,
so no data duplication or syncing is needed.
"""
import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/agribid")

client = MongoClient(MONGO_URI)
db = client.get_default_database()

# Collections matching your Mongoose schemas (server.js)
crops_collection = db["crops"]
bids_collection = db["bids"]
transactions_collection = db["transactions"]
users_collection = db["users"]


def get_db():
    return db
