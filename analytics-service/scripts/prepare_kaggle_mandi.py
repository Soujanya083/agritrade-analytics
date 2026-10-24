"""
Reproducible preparation of the raw Kaggle mandi CSV for the importer.

    python scripts/prepare_kaggle_mandi.py "Agriculture_price_dataset.csv" "mandi_clean_v2.csv"

Renames headers and rewrites dates as ISO (month-first source, re-checked on every run). Prices and rows are
untouched. Then import with:  python scripts/import_mandi_prices.py csv "mandi_clean_v2.csv" --commodity Onion ...
Run from analytics-service. See docs/REAL_DATA.md.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd  # noqa: E402

from app.services.market import kaggle_prepare  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", help="raw Kaggle CSV")
    parser.add_argument("output", help="cleaned CSV to write")
    parser.add_argument("--force", action="store_true", help="overwrite the output file if it exists")
    args = parser.parse_args()
    if os.path.exists(args.output) and not args.force:
        sys.exit(f"{args.output} already exists. Use --force to overwrite it.")
    raw = pd.read_csv(args.input, dtype=str, keep_default_na=False)
    try:
        clean, report = kaggle_prepare.prepare(raw)
    except ValueError as error:
        sys.exit(f"Stopped, nothing written: {error}")
    clean.to_csv(args.output, index=False)
    print(json.dumps(report, indent=2))
    print(f"\nWrote {args.output} ({report['rows']:,} rows). Prices were not changed.")


if __name__ == "__main__":
    main()
