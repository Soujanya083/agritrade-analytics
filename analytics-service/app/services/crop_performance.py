import pandas as pd

from app.services.data_loader import load_crops


def get_crop_performance() -> dict:
    """
    Analyze the performance of crops based on
    listings and current bid prices.
    """

    crops_df = load_crops()

    if crops_df.empty:
        return {
            "totalCropsAnalyzed": 0,
            "cropPerformance": []
        }

    # -----------------------------------
    # Validate required crop name column
    # -----------------------------------

    if "cropName" not in crops_df.columns:
        return {
            "error": "cropName column not found.",
            "availableColumns": crops_df.columns.tolist()
        }

    # -----------------------------------
    # Find the price column
    # -----------------------------------

    possible_price_columns = [
        "currentBid",
        "price",
        "amount"
    ]

    price_column = None

    for column in possible_price_columns:
        if column in crops_df.columns:
            price_column = column
            break

    if price_column is None:
        return {
            "error": "No price column found.",
            "availableColumns": crops_df.columns.tolist()
        }

    # -----------------------------------
    # Clean data
    # -----------------------------------

    df = crops_df.copy()

    df["cropName"] = df["cropName"].astype(str).str.strip()

    df[price_column] = pd.to_numeric(
        df[price_column],
        errors="coerce"
    )

    df = df.dropna(
        subset=["cropName", price_column]
    )

    if df.empty:
        return {
            "totalCropsAnalyzed": 0,
            "cropPerformance": []
        }

    # -----------------------------------
    # Calculate performance statistics
    # -----------------------------------

    performance = (
        df.groupby("cropName")
        .agg(
            listings=("cropName", "size"),
            averagePrice=(price_column, "mean"),
            minPrice=(price_column, "min"),
            maxPrice=(price_column, "max")
        )
        .reset_index()
    )

    # Round prices
    performance["averagePrice"] = (
        performance["averagePrice"].round(2)
    )

    performance["minPrice"] = (
        performance["minPrice"].round(2)
    )

    performance["maxPrice"] = (
        performance["maxPrice"].round(2)
    )

    # -----------------------------------
    # Rank crops by average price
    # -----------------------------------

    performance = performance.sort_values(
        by="averagePrice",
        ascending=False
    ).reset_index(drop=True)

    performance["rank"] = (
        performance.index + 1
    )

    # Convert rank to normal Python int
    performance["rank"] = (
        performance["rank"].astype(int)
    )

    # -----------------------------------
    # Final response
    # -----------------------------------

    return {
        "totalCropsAnalyzed": int(
            performance["cropName"].nunique()
        ),
        "cropPerformance": performance.to_dict(
            orient="records"
        )
    }