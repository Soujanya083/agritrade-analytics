import pandas as pd

from app.services.data_loader import load_crops


def get_crop_recommendation_scores() -> dict:
    """
    Calculate a market recommendation score for each crop.

    The score considers:
    - Average price (40%)
    - Market availability/listings (30%)
    - Price stability (30%)
    """

    crops_df = load_crops()

    if crops_df.empty:
        return {
            "totalCropsAnalyzed": 0,
            "recommendedCrops": []
        }

    # -----------------------------------
    # Validate required column
    # -----------------------------------

    if "cropName" not in crops_df.columns:
        return {
            "error": "cropName column not found.",
            "availableColumns": crops_df.columns.tolist()
        }

    # -----------------------------------
    # Find price column
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

    df["cropName"] = (
        df["cropName"]
        .astype(str)
        .str.strip()
    )

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
            "recommendedCrops": []
        }

    # -----------------------------------
    # Calculate crop statistics
    # -----------------------------------

    performance = (
        df.groupby("cropName")
        .agg(
            listings=("cropName", "size"),
            averagePrice=(price_column, "mean"),
            priceStdDev=(price_column, "std")
        )
        .reset_index()
    )

    # One listing means standard deviation is NaN
    performance["priceStdDev"] = (
        performance["priceStdDev"]
        .fillna(0)
    )

    # -----------------------------------
    # Calculate coefficient of variation
    # -----------------------------------

    performance["coefficientOfVariation"] = (
        performance["priceStdDev"]
        / performance["averagePrice"]
        * 100
    )

    performance["coefficientOfVariation"] = (
        performance["coefficientOfVariation"]
        .replace([float("inf"), float("-inf")], 0)
        .fillna(0)
    )

    # -----------------------------------
    # Normalize metrics to 0-100
    # -----------------------------------

    def normalize(series):
        minimum = series.min()
        maximum = series.max()

        # Prevent division by zero
        if maximum == minimum:
            return pd.Series(
                [100.0] * len(series),
                index=series.index
            )

        return (
            (series - minimum)
            / (maximum - minimum)
            * 100
        )

    # Higher average price = better
    performance["priceScore"] = normalize(
        performance["averagePrice"]
    )

    # More listings = better market activity
    performance["listingScore"] = normalize(
        performance["listings"]
    )

    # Lower volatility = better stability
    volatility_normalized = normalize(
        performance["coefficientOfVariation"]
    )

    performance["stabilityScore"] = (
        100 - volatility_normalized
    )

    # -----------------------------------
    # Calculate final market score
    # -----------------------------------

    performance["marketScore"] = (
        performance["priceScore"] * 0.40
        + performance["listingScore"] * 0.30
        + performance["stabilityScore"] * 0.30
    )

    # -----------------------------------
    # Recommendation category
    # -----------------------------------

    def get_recommendation(score):

        if score >= 75:
            return "Highly Recommended"

        elif score >= 50:
            return "Recommended"

        elif score >= 30:
            return "Moderate Opportunity"

        else:
            return "Low Opportunity"

    performance["recommendation"] = (
        performance["marketScore"]
        .apply(get_recommendation)
    )

    # -----------------------------------
    # Round values
    # -----------------------------------

    numeric_columns = [
        "averagePrice",
        "coefficientOfVariation",
        "priceScore",
        "listingScore",
        "stabilityScore",
        "marketScore"
    ]

    for column in numeric_columns:
        performance[column] = (
            performance[column].round(2)
        )

    # -----------------------------------
    # Sort by best market opportunity
    # -----------------------------------

    performance = performance.sort_values(
        by="marketScore",
        ascending=False
    ).reset_index(drop=True)

    performance["rank"] = (
        performance.index + 1
    )

    # Select response columns
    result = performance[
        [
            "rank",
            "cropName",
            "listings",
            "averagePrice",
            "coefficientOfVariation",
            "priceScore",
            "listingScore",
            "stabilityScore",
            "marketScore",
            "recommendation"
        ]
    ]

    # -----------------------------------
    # Final response
    # -----------------------------------

    return {
        "totalCropsAnalyzed": int(
            result["cropName"].nunique()
        ),
        "recommendedCrops": result.to_dict(
            orient="records"
        )
    }