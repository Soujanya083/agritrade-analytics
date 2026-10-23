"""
Generate a reproducible Markdown report (+ PNG figures) for one commodity.

    python scripts/generate_market_report.py --commodity Onion
    python scripts/generate_market_report.py --commodity Onion --state Maharashtra --horizon 14 --out reports/onion

Needs mandi history imported first (docs/REAL_DATA.md).
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from app.services.market import mandi_data, mandi_store  # noqa: E402
from app.services.market.report import build_report  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--commodity", required=True)
    parser.add_argument("--state")
    parser.add_argument("--market")
    parser.add_argument("--horizon", type=int, default=14)
    parser.add_argument("--out", default="reports")
    parser.add_argument("--segment", choices=["latest", "longest"], default="latest",
                        help="when the history has long gaps: use the most recent unbroken stretch (default) "
                             "or the longest one (better for evaluating models)")
    args = parser.parse_args()

    df = mandi_store.load_mandi_prices(args.commodity, args.state, args.market)
    if df.empty:
        sys.exit(f"No imported history for '{args.commodity}'. See docs/REAL_DATA.md.")
    series, quality = mandi_data.build_series(df, args.commodity, args.state, args.market, segment=args.segment)
    markdown, figures = build_report(series, df, args.commodity, args.state, quality, args.horizon)

    os.makedirs(args.out, exist_ok=True)
    stem = "_".join(p for p in (args.commodity, args.state) if p).replace(" ", "_").lower()
    if args.segment == "longest":
        stem += "_longest"
    for name, figure in figures.items():
        figure.savefig(os.path.join(args.out, name), dpi=140)
    path = os.path.join(args.out, f"{stem}_report.md")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(markdown)
    print(f"Wrote {path} and {len(figures)} figure(s).")


if __name__ == "__main__":
    main()
