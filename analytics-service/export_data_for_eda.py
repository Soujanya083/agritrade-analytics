"""
export_data_for_eda.py

Exports your live MongoDB Atlas collections (crops, bids, transactions,
users) into CSV files, so you have a stable, offline snapshot of data
to build your EDA notebook against. Using CSVs instead of a live DB
connection inside the notebook keeps the notebook portable - you (or
an evaluator) can open and re-run it later without needing your Atlas
credentials or network access at all.

Usage:
    cd analytics-service
    venv\\Scripts\\activate
    python export_data_for_eda.py

Output: creates an `eda_data/` folder with 4 CSV files.
"""
import os
from app.services.data_loader import load_crops, load_bids, load_transactions, load_users

OUTPUT_DIR = "eda_data"
os.makedirs(OUTPUT_DIR, exist_ok=True)

datasets = {
    "crops": load_crops(),
    "bids": load_bids(),
    "transactions": load_transactions(),
    "users": load_users(),
}

for name, df in datasets.items():
    path = os.path.join(OUTPUT_DIR, f"{name}.csv")
    df.to_csv(path, index=False)
    print(f"Exported {len(df)} rows -> {path}")

print("\nDone. You can now build the EDA notebook using files in eda_data/")