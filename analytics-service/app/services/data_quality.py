import pandas as pd
from app.services.data_loader import (
    load_crops,
    load_bids,
    load_transactions,
    load_users,
)

# Columns that should never be negative, per dataset. A negative price,
# quantity, or payout is a data-entry/pipeline bug, not a valid record.
_NON_NEGATIVE_COLUMNS = {
    "crops": ["basePrice", "currentBid", "quantityKg"],
    "bids": ["amount"],
    "transactions": ["totalAmount", "payout"],
    "users": [],
}

# Date columns that represent something that already happened, so a
# value in the future indicates bad data (clock skew, seed data, etc.)
# rather than a real record.
_DATE_COLUMNS = {
    "crops": ["createdAt", "harvestedDate"],
    "bids": ["createdAt"],
    "transactions": ["createdAt"],
    "users": ["createdAt"],
}


def _detect_invalid_values(df: pd.DataFrame, name: str) -> dict:
    """
    Flags records that are structurally present but semantically
    impossible - negative prices/quantities, or dates in the future.
    This is distinct from missing values: a negative price passes a
    null check but is still bad data.
    """
    issues = {}

    for column in _NON_NEGATIVE_COLUMNS.get(name, []):
        if column in df.columns:
            numeric = pd.to_numeric(df[column], errors="coerce")
            negative_count = int((numeric < 0).sum())
            if negative_count > 0:
                issues[f"{column}_negative"] = negative_count

    now = pd.Timestamp.now(tz="UTC")

    for column in _DATE_COLUMNS.get(name, []):
        if column in df.columns:
            dates = pd.to_datetime(df[column], errors="coerce", utc=True)
            future_count = int((dates > now).sum())
            if future_count > 0:
                issues[f"{column}_future_date"] = future_count

    return issues


def _profile_dataframe(df: pd.DataFrame, name: str) -> dict:
    """Generate a simple, explainable data-quality profile."""

    if df.empty:
        return {
            "dataset": name,
            "records": 0,
            "columns": 0,
            "missingValues": {},
            "completenessPercentage": 0.0,
            "duplicateRecords": 0,
            "invalidValues": {},
            "status": "empty",
        }

    missing = {
        column: int(count)
        for column, count in df.isnull().sum().items()
        if count > 0
    }

    duplicate_count = int(df.duplicated().sum())
    invalid_values = _detect_invalid_values(df, name)

    total_cells = len(df) * len(df.columns)
    missing_cells = sum(missing.values())
    completeness = (
        round(((total_cells - missing_cells) / total_cells) * 100, 2)
        if total_cells > 0
        else 0.0
    )

    return {
        "dataset": name,
        "records": int(len(df)),
        "columns": int(len(df.columns)),
        "missingValues": missing,
        "completenessPercentage": completeness,
        "duplicateRecords": duplicate_count,
        "invalidValues": invalid_values,
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

    total_invalid = sum(
        sum(dataset["invalidValues"].values())
        for dataset in datasets
    )

    datasets_with_records = [d for d in datasets if d["records"] > 0]
    overall_completeness = (
        round(
            sum(d["completenessPercentage"] for d in datasets_with_records)
            / len(datasets_with_records),
            2,
        )
        if datasets_with_records
        else 0.0
    )

    return {
        "summary": {
            "datasetsChecked": len(datasets),
            "totalRecords": total_records,
            "totalMissingValues": total_missing,
            "totalDuplicateRecords": total_duplicates,
            "totalInvalidValues": total_invalid,
            "overallCompletenessPercentage": overall_completeness,
        },
        "datasets": datasets,
    }