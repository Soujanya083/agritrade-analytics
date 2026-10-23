"""
Import REAL AGMARKNET mandi prices into MongoDB.

  # 0. Look inside a file first (writes nothing): which crops/states/dates, rough database size
  python scripts/import_mandi_prices.py scan path/to/prices.csv

  # 1. Years of history from a downloaded bulk CSV (see docs/REAL_DATA.md)
  python scripts/import_mandi_prices.py csv path/to/prices.csv --commodity Onion Tomato Potato --dry-run
  python scripts/import_mandi_prices.py csv path/to/prices.csv --commodity Onion Tomato Potato

  # 2. Today's prices from the official API (run daily to keep history growing)
  DATAGOVIN_API_KEY=... python scripts/import_mandi_prices.py api
  python scripts/import_mandi_prices.py api --state Maharashtra --commodity Onion

Safe to re-run: duplicate rows are skipped.
"""
import argparse
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from app.db import mandi_prices_collection  # noqa: E402
from app.services.market import mandi_import, mandi_store  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="mode", required=True)
    csv_cmd = sub.add_parser("csv", help="bulk import from CSV file(s) or glob patterns")
    csv_cmd.add_argument("paths", nargs="+")
    csv_cmd.add_argument("--chunksize", type=int, default=100_000)
    csv_cmd.add_argument("--commodity", nargs="+", help="only import these commodities (exact names; see `scan`)")
    csv_cmd.add_argument("--state", nargs="+", help="only import these states")
    csv_cmd.add_argument("--dry-run", action="store_true", help="read, clean and count, but write nothing")
    scan_cmd = sub.add_parser("scan", help="read-only: list the commodities, states and dates a CSV holds")
    scan_cmd.add_argument("path")
    api_cmd = sub.add_parser("api", help="pull current data from data.gov.in")
    api_cmd.add_argument("--state")
    api_cmd.add_argument("--commodity")
    api_cmd.add_argument("--max-records", type=int)
    sub.add_parser("summary", help="show which commodities have enough real history, and what to run next")
    args = parser.parse_args()

    if args.mode == "scan":
        print(json.dumps(mandi_import.scan_csv(args.path), indent=2))
        return

    if args.mode == "summary":
        from app.services.market.real_market import real_market_commodities

        rows = real_market_commodities()
        if not rows:
            sys.exit("Nothing imported yet. Run: python scripts/import_mandi_prices.py csv <file>")
        print(f"{'Commodity':34s} {'Days':>6s} {'Markets':>8s}  Readiness")
        for r in rows[:40]:
            print(f"{r['commodity'][:34]:34s} {r['daysSpanned']:6d} {r['markets']:8d}  {r['readiness']['label']}")
        best = [r for r in rows if r["readiness"]["tier"] == "full"][:3] or [r for r in rows if r["readiness"]["tier"] != "insufficient"][:3]
        print("\nSuggested next steps:")
        for r in best:
            print(f'  python scripts/generate_market_report.py --commodity "{r["commodity"]}"')
        return

    if args.mode == "csv":
        files = [f for pattern in args.paths for f in sorted(glob.glob(pattern))]
        if not files:
            sys.exit("No files matched.")
        target = None if args.dry_run else mandi_prices_collection
        if target is not None:
            mandi_store.ensure_indexes()
        for path in files:
            print(f"{'DRY RUN: reading' if args.dry_run else 'Importing'} {path} ...")
            print(json.dumps(mandi_import.import_csv(target, path, args.chunksize, commodities=args.commodity, states=args.state), indent=2))
        if args.dry_run:
            print("\nDry run only: nothing was written. Re-run without --dry-run to import.")
            return
    else:
        mandi_store.ensure_indexes()
        key = os.getenv("DATAGOVIN_API_KEY")
        if not key:
            sys.exit("Set DATAGOVIN_API_KEY (free at data.gov.in -> My Account).")
        filters = {k: v for k, v in (("state.keyword", args.state), ("commodity", args.commodity)) if v}
        resource = os.getenv("DATAGOVIN_RESOURCE_ID") or mandi_import.DEFAULT_RESOURCE_ID
        print(json.dumps(mandi_import.import_api(mandi_prices_collection, key, resource, filters, args.max_records), indent=2))

    total = mandi_prices_collection.estimated_document_count()
    print(f"\nmandi_prices now holds ~{total:,} rows.")


if __name__ == "__main__":
    main()
