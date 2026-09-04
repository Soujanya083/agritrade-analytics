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

    return report