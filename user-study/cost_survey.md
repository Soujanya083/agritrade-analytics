# Cost survey (farmers, about 5 minutes)

Ask about the **last time** they sold a crop at a mandi. Use their own words and numbers. "I don't know" is a valid
answer: leave the cell empty rather than guessing.

1. Which crop and which market? (record the state)
2. Roughly what percentage of the sale price did the commission agent or market fee take? -> `commission_pct`
3. What did loading, unloading and packing cost, per quintal? -> `handling_per_quintal` (rupees)
4. How much of the load was lost or sold cheaper because of damage or drying? -> `shrinkage_pct`
5. What did transport to the market cost, per quintal? -> `transport_per_quintal` (rupees)
6. Compared with the price you were told before travelling, how much lower (in %) was the price you actually got? -> `price_haircut_pct`

Convert per-load amounts to per-quintal before writing them down (1 quintal = 100 kg).
These answers replace the assumed values in `PROFIT_SCENARIOS`. With fewer than 8 farmers the tool prints a warning:
report them as rough ranges.
