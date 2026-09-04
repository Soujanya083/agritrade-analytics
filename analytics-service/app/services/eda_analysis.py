import pandas as pd
from app.services.data_loader import load_crops, load_bids, load_transactions


def detect_outliers(series: pd.Series):
    series = pd.to_numeric(series, errors="coerce").dropna()

    if len(series) < 4:
        return {
            "method": "IQR",
            "count": 0,
            "percentage": 0.0
        }

    q1 = series.quantile(0.25)
    q3 = series.quantile(0.75)
    iqr = q3 - q1

    lower_bound = q1 - 1.5 * iqr
    upper_bound = q3 + 1.5 * iqr

    outliers = series[
        (series < lower_bound) | (series > upper_bound)
    ]

    return {
        "method": "IQR",
        "count": int(len(outliers)),
        "percentage": round((len(outliers) / len(series)) * 100, 2),
        "lowerBound": round(float(lower_bound), 2),
        "upperBound": round(float(upper_bound), 2)
    }


def _seasonal_price_pattern(crops_df: pd.DataFrame) -> dict:
    """
    Average price by day-of-week and by month. This surfaces whatever
    seasonal pattern the data actually shows rather than assuming one -
    with limited marketplace history the pattern may be noisy, which is
    itself a useful, honest finding.
    """
    if "currentBid" not in crops_df.columns or "createdAt" not in crops_df.columns:
        return {}

    df = crops_df.copy()
    df["currentBid"] = pd.to_numeric(df["currentBid"], errors="coerce")
    df["createdAt"] = pd.to_datetime(df["createdAt"], errors="coerce")
    df = df.dropna(subset=["currentBid", "createdAt"])

    if df.empty:
        return {}

    df["dayOfWeek"] = df["createdAt"].dt.day_name()
    df["month"] = df["createdAt"].dt.month_name()

    by_day = df.groupby("dayOfWeek")["currentBid"].mean().round(2)
    by_month = df.groupby("month")["currentBid"].mean().round(2)

    return {
        "averagePriceByDayOfWeek": by_day.to_dict(),
        "averagePriceByMonth": by_month.to_dict(),
        "note": (
            "Based on available marketplace history; patterns may firm up "
            "as more data accumulates over multiple seasons."
        ),
    }


def _correlation_analysis(crops_df: pd.DataFrame) -> dict:
    """
    Pearson correlation between numeric crop fields - e.g. does a higher
    base (asking) price actually predict a higher final winning bid?
    Reported as correlation only; explicitly not claimed as causation.
    """
    numeric_df = crops_df.select_dtypes(include="number")

    if numeric_df.shape[1] < 2 or len(numeric_df) < 3:
        return {}

    corr_matrix = numeric_df.corr(numeric_only=True).round(3)
    columns = corr_matrix.columns.tolist()

    pairs = []
    for i in range(len(columns)):
        for j in range(i + 1, len(columns)):
            value = corr_matrix.iloc[i, j]
            if pd.notna(value):
                pairs.append({
                    "fieldA": columns[i],
                    "fieldB": columns[j],
                    "correlation": float(value),
                })

    return {
        "pairwiseCorrelations": pairs,
        "note": "Correlation does not imply causation.",
    }


def generate_eda_report():
    crops = load_crops()
    bids = load_bids()
    transactions = load_transactions()

    report = {
        "datasetOverview": {
            "crops": {
                "records": int(len(crops)),
                "columns": int(len(crops.columns))
            },
            "bids": {
                "records": int(len(bids)),
                "columns": int(len(bids.columns))
            },
            "transactions": {
                "records": int(len(transactions)),
                "columns": int(len(transactions.columns))
            }
        }
    }

    # Crop distribution
    crop_name_column = next(
        (col for col in ["cropName", "name", "crop"] if col in crops.columns),
        None
    )

    if crop_name_column:
        distribution = crops[crop_name_column].value_counts().head(15)

        report["cropDistribution"] = [
            {
                "crop": str(crop),
                "count": int(count)
            }
            for crop, count in distribution.items()
        ]

    # Numerical analysis
    numeric_columns = crops.select_dtypes(include="number").columns.tolist()

    report["numericalAnalysis"] = {}

    for column in numeric_columns:
        series = crops[column].dropna()

        if len(series) > 0:
            report["numericalAnalysis"][column] = {
                "mean": round(float(series.mean()), 2),
                "median": round(float(series.median()), 2),
                "minimum": round(float(series.min()), 2),
                "maximum": round(float(series.max()), 2),
                "standardDeviation": round(float(series.std()), 2)
                if len(series) > 1 else 0,
                "outliers": detect_outliers(series)
            }

    # Seasonal patterns (day-of-week / month price averages)
    report["seasonalPatterns"] = _seasonal_price_pattern(crops)

    # Correlation between numeric crop fields (e.g. basePrice vs currentBid)
    report["correlationAnalysis"] = _correlation_analysis(crops)

    return report