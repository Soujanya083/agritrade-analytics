import pandas as pd

from app.services.data_loader import load_crops
from app.utils.ttl_cache import ttl_cache

# These weights are a documented judgment call, not derived from data -
# there's no ground-truth "good outcome" label yet to fit them against.
# Phase 6 (decision backtesting) is what actually validates whether
# scoring crops this way correlates with good outcomes; until then,
# this is a transparent, explainable heuristic - not a claim of
# statistical optimality.
PRICE_WEIGHT = 0.40
LISTING_WEIGHT = 0.30
STABILITY_WEIGHT = 0.30

# Below this many listings, a crop's price standard deviation is not a
# meaningful measurement (e.g. exactly 1 listing always has zero
# variance, which would otherwise score as "perfectly stable" purely
# from having too little data to show any variance at all). Crops
# below this threshold get "Insufficient Data" instead of a
# potentially misleading confident label.
MIN_LISTINGS_FOR_RELIABLE_SCORE = 3


@ttl_cache(seconds=300)
def get_crop_recommendation_scores() -> dict:
    """
    Calculate a market recommendation score for each crop.

    The score considers:
    - Average price (40%)
    - Market availability/listings (30%)
    - Price stability (30%)

    These weights are a documented starting point, not a data-derived
    optimum - see PRICE_WEIGHT / LISTING_WEIGHT / STABILITY_WEIGHT
    above. Crops with fewer than MIN_LISTINGS_FOR_RELIABLE_SCORE
    listings are labeled "Insufficient Data" rather than scored
    confidently, since their stability measurement isn't meaningful
    yet.
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

    # DEMAND-STRENGTH TERM. A rupee price LEVEL is not a profitability signal:
    # Apple (Rs.100/kg) would always out-rank Onion (Rs.20/kg) just for being
    # dearer. What is comparable across crops is how far buyers bid ABOVE the
    # farmer's asking price. When asking prices exist we score that premium and
    # keep the absolute average only for display.
    premium_available = (
        price_column == "currentBid" and "basePrice" in df.columns
    )
    if premium_available:
        base = pd.to_numeric(df["basePrice"], errors="coerce")
        df["_bidPremiumPct"] = (df[price_column] / base.where(base > 0) - 1) * 100
        premium_available = bool(df["_bidPremiumPct"].notna().any())

    aggregations = dict(
        listings=("cropName", "size"),
        averagePrice=(price_column, "mean"),
        priceStdDev=(price_column, "std"),
    )
    if premium_available:
        aggregations["bidPremiumPct"] = ("_bidPremiumPct", "mean")

    performance = (
        df.groupby("cropName")
        .agg(**aggregations)
        .reset_index()
    )
    if premium_available:
        performance["bidPremiumPct"] = performance["bidPremiumPct"].fillna(0)

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

    # Higher buyer premium over the asking price = stronger demand = better.
    # (Falls back to the old absolute-price score only if asking prices are
    # unavailable; the methodology text says which basis was used.)
    performance["priceScore"] = normalize(
        performance["bidPremiumPct"] if premium_available else performance["averagePrice"]
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
        performance["priceScore"] * PRICE_WEIGHT
        + performance["listingScore"] * LISTING_WEIGHT
        + performance["stabilityScore"] * STABILITY_WEIGHT
    )

    # -----------------------------------
    # Data confidence (sample size)
    # -----------------------------------

    performance["dataConfidence"] = performance["listings"].apply(
        lambda n: "low" if n < MIN_LISTINGS_FOR_RELIABLE_SCORE else "high"
    )

    # -----------------------------------
    # Recommendation category
    # -----------------------------------

    def get_recommendation(score, listings):

        if listings < MIN_LISTINGS_FOR_RELIABLE_SCORE:
            return "Insufficient Data"

        if score >= 75:
            return "Highly Recommended"

        elif score >= 50:
            return "Recommended"

        elif score >= 30:
            return "Moderate Opportunity"

        else:
            return "Low Opportunity"

    performance["recommendation"] = performance.apply(
        lambda row: get_recommendation(row["marketScore"], row["listings"]),
        axis=1,
    )

    # -----------------------------------
    # Round values
    # -----------------------------------

    numeric_columns = [
        "averagePrice",
        *(["bidPremiumPct"] if premium_available else []),
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
            *(["bidPremiumPct"] if premium_available else []),
            "coefficientOfVariation",
            "priceScore",
            "listingScore",
            "stabilityScore",
            "marketScore",
            "dataConfidence",
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
        "methodology": (
            ("priceScore = how far buyers bid above the asking price (demand strength; "
             "comparable across crops). " if premium_available else
             "priceScore = absolute average price (asking prices unavailable, so expensive crops "
             "are favoured - treat with caution). ")
            + f"marketScore = priceScore*{PRICE_WEIGHT} + listingScore*{LISTING_WEIGHT} "
            f"+ stabilityScore*{STABILITY_WEIGHT}. These weights are a documented "
            "judgment call, not derived from data - decision backtesting (separate "
            "feature) is what actually validates whether this scoring correlates "
            "with good outcomes. Crops with fewer than "
            f"{MIN_LISTINGS_FOR_RELIABLE_SCORE} listings are marked 'Insufficient "
            "Data' rather than confidently scored."
        ),
        "recommendedCrops": result.to_dict(
            orient="records"
        )
    }