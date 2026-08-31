"""
Recommendation engine: "which crop has higher demand in this market?"

Approach: demand-supply gap scoring.
- Demand proxy  = bid count + avg bid amount relative to base price (buyer interest)
- Supply proxy  = number of active crop listings for that crop/region
- Score = normalized demand / normalized supply
  A high score means lots of buyer interest relative to how much is
  being listed -> good opportunity for a farmer to sell that crop there.

This is intentionally simple and explainable (not a black box) —
in interviews you want to be able to walk through exactly how the
score is computed.
"""
import pandas as pd
from app.services.data_loader import load_crops, load_bids


def recommend_crops(location: str = None, top_n: int = 5) -> list[dict]:
    crops = load_crops()
    bids = load_bids()
    if crops.empty:
        return []

    if location:
        crops = crops[crops["location"].str.lower() == location.lower()]
        if crops.empty:
            return []

    # Supply: active listings per crop
    supply = (
        crops[crops["status"] == "open"]
        .groupby("cropName")
        .agg(supplyCount=("_id", "count"), avgBasePrice=("basePrice", "mean"))
        .reset_index()
    )

    # Demand: bids placed on those crops
    if not bids.empty:
        merged = bids.merge(crops[["_id", "cropName"]], left_on="cropId", right_on="_id", how="left")
        demand = (
            merged.groupby("cropName")
            .agg(bidCount=("_id_x", "count"), avgBidAmount=("amount", "mean"))
            .reset_index()
        )
    else:
        demand = pd.DataFrame(columns=["cropName", "bidCount", "avgBidAmount"])

    combined = supply.merge(demand, on="cropName", how="left").fillna(0)

    # normalize (min-max) so score is comparable across crops
    def norm(col):
        if combined[col].max() == combined[col].min():
            return combined[col] * 0
        return (combined[col] - combined[col].min()) / (combined[col].max() - combined[col].min())

    combined["demandScore"] = norm("bidCount")
    combined["supplyScore"] = norm("supplyCount")
    # add 0.1 to avoid divide-by-zero; higher = more demand relative to supply
    combined["opportunityScore"] = (combined["demandScore"] + 0.1) / (combined["supplyScore"] + 0.1)

    result = combined.sort_values("opportunityScore", ascending=False).head(top_n)
    return result.round(3).to_dict(orient="records")
