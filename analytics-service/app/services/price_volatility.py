import pandas as pd

from app.services.data_loader import load_crops


def get_price_volatility() -> dict:
    """
    Analyze price volatility for each crop.

    Volatility is calculated using:
    - Standard Deviation
    - Coefficient of Variation (CV)

    CV = (Standard Deviation / Average Price) * 100
    """

    crops_df = load_crops()

    # -----------------------------------
    # Check for empty data
    # -----------------------------------

    if crops_df.empty:
        return {
            "totalCropsAnalyzed": 0,
            "priceVolatility": []
        }

    # -----------------------------------
    # Validate crop name column
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
            "priceVolatility": []
        }

    # -----------------------------------
    # Calculate volatility statistics
    # -----------------------------------

    volatility = (
        df.groupby("cropName")
        .agg(
            listings=("cropName", "size"),
            averagePrice=(price_column, "mean"),
            priceStandardDeviation=(price_column, "std"),
            minPrice=(price_column, "min"),
            maxPrice=(price_column, "max")
        )
        .reset_index()
    )

    # Standard deviation can be NaN
    # when only one listing exists
    volatility["priceStandardDeviation"] = (
        volatility["priceStandardDeviation"]
        .fillna(0)
    )

    # -----------------------------------
    # Calculate Coefficient of Variation
    # -----------------------------------

    volatility["coefficientOfVariation"] = (
        volatility["priceStandardDeviation"]
        / volatility["averagePrice"]
        * 100
    )

    # Protect against division problems
    volatility["coefficientOfVariation"] = (
        volatility["coefficientOfVariation"]
        .replace([float("inf"), float("-inf")], 0)
        .fillna(0)
    )

    # -----------------------------------
    # Assign volatility level
    # -----------------------------------

    def get_volatility_level(cv):

        if cv < 10:
            return "Low"

        elif cv < 25:
            return "Medium"

        else:
            return "High"

    volatility["volatilityLevel"] = (
        volatility["coefficientOfVariation"]
        .apply(get_volatility_level)
    )

    # -----------------------------------
    # Round values
    # -----------------------------------

    numeric_columns = [
        "averagePrice",
        "priceStandardDeviation",
        "coefficientOfVariation",
        "minPrice",
        "maxPrice"
    ]

    for column in numeric_columns:
        volatility[column] = volatility[column].round(2)

    # -----------------------------------
    # Sort by highest volatility
    # -----------------------------------

    volatility = volatility.sort_values(
        by="coefficientOfVariation",
        ascending=False
    ).reset_index(drop=True)

    # -----------------------------------
    # Final response
    # -----------------------------------

    return {
        "totalCropsAnalyzed": int(
            volatility["cropName"].nunique()
        ),
        "priceVolatility": volatility.to_dict(
            orient="records"
        )
    }