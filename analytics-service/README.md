# AgriTrade Analytics Service

Python microservice for the DA/ML layer of AgriTrade Analytics.
Reads directly from the same MongoDB your Node/Express server (`server/server.js`)
already writes to — no data duplication, no sync jobs.

## Architecture

```
React (agribid)  --calls-->  Node/Express (server/)      [auth, bidding, payments]
                 --calls-->  FastAPI (analytics-service/) [analytics, ML, recommendations]
                                        |
                                  MongoDB (shared)
```

## Setup

```bash
cd analytics-service
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # then edit MONGO_URI to match your server's .env
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for interactive Swagger docs — test every
endpoint from the browser before wiring up React.

## Endpoints (Phase 2 + Phase 3 of the roadmap)

| Endpoint | Purpose |
|---|---|
| `GET /api/analytics/price-trend?cropName=Wheat` | Historical avg price over time |
| `GET /api/analytics/best-selling-crops?topN=10` | Ranked by completed-transaction revenue |
| `GET /api/analytics/region-demand` | Bid counts by location + crop |
| `GET /api/analytics/farmer-revenue` | Total payout per farmer |
| `GET /api/analytics/buyer-patterns` | Spend/frequency per buyer |
| `GET /api/analytics/price-prediction?cropName=Wheat&daysAhead=14` | Prophet forecast (linear fallback if <10 data points) |
| `GET /api/analytics/recommend-crops?location=Pune&topN=5` | "Which crop has higher demand here?" — demand/supply gap score |

## Next steps (in order)

1. **Seed test data.** Your live DB probably has too few transactions to
   forecast meaningfully yet. Write a quick seed script (or use MongoDB
   Compass) to insert ~30-60 days of sample crops/bids/transactions across
   3-4 crops and 2-3 locations so the endpoints return real-looking results.
2. **Test each endpoint via `/docs`** once seeded.
3. **Wire into React.** In `DashboardPage.js`, add `fetch` calls to
   `http://localhost:8000/api/analytics/...` alongside your existing calls
   to the Node server, and render with a chart library (Recharts, already
   common in React dashboards).
4. **Model comparison for your report.** Once `price_prediction.py` is
   working end-to-end, add an ARIMA or simple LSTM variant next to Prophet
   and log MAE/RMSE for each — this comparison is exactly what your 5 base
   papers report, and it's the strongest "I understand the tradeoffs"
   talking point in an interview.
5. **Deploy.** Two options: run analytics-service as a second process
   alongside Node (simplest for a college demo), or containerize both with
   Docker Compose so you can show "microservices architecture" as another
   resume line.

## Notes

- `price_prediction.py` currently forecasts based on `currentBid` (the
  live/winning bid) rather than `basePrice`, since that better reflects
  actual market price. Switch the field in `_prepare_series()` if you'd
  rather forecast asking price instead.
- The recommendation score in `recommendation.py` is intentionally simple
  (normalized demand ÷ normalized supply) so you can explain every step
  of it in a viva/interview — resist the urge to make it a black box.
