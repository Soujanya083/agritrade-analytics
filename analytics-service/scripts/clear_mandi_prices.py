"""
Delete ONLY the imported mandi price history (the `mandi_prices` collection).

Users, crops, bids, transactions and everything else are NOT touched.
Run from analytics-service with the venv active:

    python scripts/clear_mandi_prices.py

It shows which database it is connected to and asks you to type DELETE first.
The target is whatever MONGO_URI points at (.env = local; $env:MONGO_URI = Atlas).
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from app.db import MONGO_URI, db, mandi_prices_collection  # noqa: E402


def masked(uri: str) -> str:
    """Hide the username and password; keep the host and database name."""
    return re.sub(r"//[^@/]*@", "//<hidden>@", uri)


def main():
    count = mandi_prices_collection.estimated_document_count()
    print("Server   :", masked(MONGO_URI))
    print("Database :", db.name)
    print(f"Will delete the collection 'mandi_prices' ({count:,} rows).")
    print("Not touched: users, crops, bids, transactions, notifications.")
    if count == 0:
        print("Already empty. Nothing to do.")
        return
    if input("Type DELETE to remove these rows: ").strip() != "DELETE":
        print("Cancelled. Nothing was deleted.")
        return
    mandi_prices_collection.drop()
    print("Done. mandi_prices removed (the importer recreates it and its indexes).")


if __name__ == "__main__":
    main()
