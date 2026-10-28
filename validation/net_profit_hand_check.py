import sys, os
sys.path.insert(0, os.getcwd())   # run from analytics-service with the venv active
from app.services import market_recommendation as mr
recs = [
  {"market": "A", "state": "Karnataka", "district": "D1", "modal_price": 2000, "variety": "Local"},
  {"market": "B", "state": "Maharashtra", "district": "D2", "modal_price": 2500, "variety": "Local"},
  {"market": "C", "state": "Tamilnadu", "district": "D3", "modal_price": 2100, "variety": "Local"},
]
mr.fetch_mandi_prices = lambda *a, **k: {"commodity": "Onion", "source": "live", "records": recs}
mr._imported_market_records = lambda crop: None
r = mr.get_market_recommendation("Onion", farmer_state="Karnataka", quantity_kg=500)
# HAND CALCULATION (independent of the code): per quintal, net = modal - transport - storage, where the
# documented assumptions are: transport 80 same state / 250 other state, storage 30 -> A 1890, B 2220, C 1990.
expected = {"A": 2000 - 80 - 30, "B": 2500 - 250 - 30, "C": 2100 - 250 - 30}
for m in r["rankedMarkets"]:
    exp = expected[m["market"]]; key = [k for k in m if 'net' in k.lower() and 'quintal' in k.lower()][0]
    print(f"{m['market']}: code net/quintal {m[key]:.0f} vs hand {exp}  {'OK' if round(m[key]) == exp else 'MISMATCH'}")
best = r["recommendedMarket"]
print("recommended:", best["market"], "| total net for 500 kg:", best["expectedTotalNetProfit"], "vs hand", expected["B"] * 5)
