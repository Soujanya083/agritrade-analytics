"""
Remove the SYNTHETIC demo data created by seed_data.py once real users are on the platform.

It deletes ONLY records that belong to demo users (email starting with "seed."): their crops, bids,
transactions and notifications, plus the users themselves. Real users' data is never touched, even if
it was created on the same days.

  python scripts/purge_seed_data.py            # DRY RUN: only prints what would be deleted
  python scripts/purge_seed_data.py --apply    # actually delete (take a backup first: mongodump)

After purging, GET /api/analytics/... will report syntheticPercent = 0 and forecasts / segments are
computed from real activity only (which may mean "not enough data yet" - that is the honest answer).
"""
import argparse
import os
import sys

SEED_EMAIL_REGEX = "^seed\\."
COLLECTIONS = ("users", "crops", "bids", "transactions", "notifications")


def purge(db, apply: bool = False, email_regex: str = SEED_EMAIL_REGEX) -> dict:
    """Returns how many documents were (or would be) removed per collection."""
    seed_users = list(db["users"].find({"email": {"$regex": email_regex, "$options": "i"}}, {"_id": 1}))
    user_ids = [u["_id"] for u in seed_users]
    if not user_ids:
        return {name: 0 for name in COLLECTIONS}
    crop_ids = [c["_id"] for c in db["crops"].find({"farmerId": {"$in": user_ids}}, {"_id": 1})]

    filters = {
        "notifications": {"userId": {"$in": user_ids}},
        "transactions": {"$or": [{"farmerId": {"$in": user_ids}}, {"buyerId": {"$in": user_ids}}, {"cropId": {"$in": crop_ids}}]},
        "bids": {"$or": [{"buyerId": {"$in": user_ids}}, {"cropId": {"$in": crop_ids}}]},
        "crops": {"farmerId": {"$in": user_ids}},
        "users": {"_id": {"$in": user_ids}},
    }
    counts = {}
    for name in ("notifications", "transactions", "bids", "crops", "users"):   # children before parents
        counts[name] = db[name].count_documents(filters[name])
        if apply and counts[name]:
            db[name].delete_many(filters[name])
    return counts


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="really delete (default is a dry run)")
    args = ap.parse_args(argv)
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from app.db import MONGO_URI, db  # noqa: E402

    print(f"Database: {MONGO_URI.split('@')[-1]}")
    counts = purge(db, apply=args.apply)
    verb = "Deleted" if args.apply else "WOULD delete (dry run)"
    for name, n in counts.items():
        print(f"  {verb}: {n:>6} {name}")
    if not args.apply:
        print("\nNothing was changed. Re-run with --apply to delete these (back up first).")


if __name__ == "__main__":
    main()
