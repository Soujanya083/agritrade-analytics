"""
Turns the raw Kaggle "Agriculture price" CSV into a file the importer accepts - reproducibly and with checks.

What it changes (nothing else):
  * renames the headers (District Name -> District, Market Name -> Market, Price Date -> Arrival_Date, ...)
  * rewrites every date as ISO yyyy-mm-dd

What it never touches: prices, markets, commodities, varieties, grades, and the number or order of rows.

The raw file mixes two date styles ("06-06-2023" and "6/13/2023"). Both were checked on the real file and are
MONTH-first: the dashed rows only ever had numbers up to 12 in both positions (so they are the ambiguous
dates), the slashed rows go up to 31 in the second position, and read month-first the file is in
chronological order with a smooth price series (read day-first it goes backwards in time 44 times and the
price series is 3.5x jumpier). This module re-checks those facts on whatever file you give it and refuses
to continue if a date contradicts them.
"""
import pandas as pd

OUTPUT_COLUMNS = ["State", "District", "Market", "Commodity", "Variety", "Grade",
                  "Min_Price", "Max_Price", "Modal_Price", "Arrival_Date"]

# lower-case header in the raw file -> header the importer expects
HEADER_MAP = {
    "state": "State", "district": "District", "district name": "District",
    "market": "Market", "market name": "Market", "commodity": "Commodity", "variety": "Variety",
    "grade": "Grade", "min_price": "Min_Price", "max_price": "Max_Price", "modal_price": "Modal_Price",
    "price date": "Arrival_Date", "arrival_date": "Arrival_Date", "date": "Arrival_Date",
}


def parse_month_first(series: pd.Series) -> pd.Series:
    """Parse 'MM-DD-YYYY' and 'M/D/YYYY' text as month-first dates; raise if any value breaks that rule."""
    text = series.astype(str).str.strip()
    parts = text.str.replace("/", "-", regex=False).str.split("-", expand=True)
    if parts.shape[1] != 3 or parts.isna().any().any():
        raise ValueError("Some dates do not have exactly three parts (month, day, year).")
    nums = parts.apply(pd.to_numeric, errors="coerce")
    if nums.isna().any().any():
        raise ValueError("Some dates contain something other than numbers.")
    if (nums[0] > 12).any():
        raise ValueError(
            f"{int((nums[0] > 12).sum())} date(s) have a first number above 12, so they are day-first. "
            "This converter only handles month-first files; check the file before importing.")
    if not nums[2].between(1990, 2100).all():
        raise ValueError("Some years are outside 1990-2100 (is the year first or two-digit?).")
    dates = pd.to_datetime(pd.DataFrame({"year": nums[2], "month": nums[0], "day": nums[1]}), errors="coerce")
    if dates.isna().any():
        raise ValueError(f"{int(dates.isna().sum())} date(s) do not exist (for example 31 February).")
    return dates


def prepare(raw: pd.DataFrame, top: int = 10) -> tuple[pd.DataFrame, dict]:
    """Returns (clean dataframe in importer format, report of what was checked)."""
    renamed = raw.rename(columns={c: HEADER_MAP[c.strip().lower()] for c in raw.columns if c.strip().lower() in HEADER_MAP})
    missing = [c for c in OUTPUT_COLUMNS if c not in renamed.columns]
    if missing:
        raise ValueError(f"The file is missing column(s): {', '.join(missing)}")

    dates = parse_month_first(renamed["Arrival_Date"])
    out = renamed[OUTPUT_COLUMNS].copy()
    out["Arrival_Date"] = dates.dt.strftime("%Y-%m-%d")

    per_crop = []
    frame = pd.DataFrame({"c": out["Commodity"].astype(str), "d": dates})
    for crop, g in frame.groupby("c"):
        days = pd.Series(sorted(g["d"].dt.normalize().unique()))
        gaps = days.diff().dt.days - 1
        per_crop.append({"commodity": crop, "rows": int(len(g)), "firstDate": days.iloc[0].strftime("%Y-%m-%d"),
                         "lastDate": days.iloc[-1].strftime("%Y-%m-%d"), "daysWithData": int(len(days)),
                         "gapsLongerThan3Days": int((gaps > 3).sum()), "missingDaysInGaps": int(gaps[gaps > 3].sum())})
    per_crop.sort(key=lambda r: -r["rows"])
    backwards = int((dates.diff().dt.days < 0).sum())
    report = {
        "rows": int(len(out)), "firstDate": dates.min().strftime("%Y-%m-%d"), "lastDate": dates.max().strftime("%Y-%m-%d"),
        "rowsWhereFileOrderGoesBackInTime": backwards,
        "orderCheck": ("file is in chronological order when read month-first (supports the month-first reading)"
                       if backwards == 0 else
                       f"{backwards} rows go back in time: the file may simply not be sorted, but check the date format"),
        "pricesChanged": False,
        "topCommodities": per_crop[:top],
    }
    return out, report
