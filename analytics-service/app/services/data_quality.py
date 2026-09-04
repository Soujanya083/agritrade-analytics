import pandas as pd
from app.services.data_loader import (
    load_crops,
    load_bids,
    load_transactions,
    load_users,
)


def _profile_dataframe(df: pd.DataFrame, name: str) -> dict:
    """Generate a simple, explainable data-quality profile."""

    if df.empty:
        return {
            "dataset": name,
            "records": 0,
            "columns": 0,
            "missingValues": {},
            "duplicateRecords": 0,
            "status": "empty",
        }

    missing = {
        column: int(count)
        for column, count in df.isnull().sum().items()
        if count > 0
    }

    duplicate_count = int(df.duplicated().sum())

    return {
        "dataset": name,
        "records": int(len(df)),
        "columns": int(len(df.columns)),
        "missingValues": missing,
        "duplicateRecords": duplicate_count,
        "status": "checked",
    }


def generate_data_quality_report() -> dict:
    """Audit all core marketplace datasets."""

    crops = load_crops()
    bids = load_bids()
    transactions = load_transactions()
    users = load_users()

    datasets = [
        _profile_dataframe(crops, "crops"),
        _profile_dataframe(bids, "bids"),
        _profile_dataframe(transactions, "transactions"),
        _profile_dataframe(users, "users"),
    ]

    total_records = sum(dataset["records"] for dataset in datasets)
    total_duplicates = sum(dataset["duplicateRecords"] for dataset in datasets)

    total_missing = sum(
        sum(dataset["missingValues"].values())
        for dataset in datasets
    )

    return {
        "summary": {
            "datasetsChecked": len(datasets),
            "totalRecords": total_records,
            "totalMissingValues": total_missing,
            "totalDuplicateRecords": total_duplicates,
        },
        "datasets": datasets,
    }