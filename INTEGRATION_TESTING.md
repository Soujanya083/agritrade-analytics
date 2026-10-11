# Integration Testing Checklist

Automated tests (analytics-service: 89 original + 130 added, plus 36 HTTP-level
API cases; server: 36 original + 53 added; frontend: 53 added) and CI
(`.github/workflows/ci.yml`) cover the individual pieces well. What's still worth doing before submission is a manual
pass through the **full chain** — frontend → backend → analytics
service → database — since that's the one path nothing automated
currently exercises end-to-end.

Run through this once with both servers running locally
(`npm run dev` in `server/`, `uvicorn app.main:app --reload` in
`analytics-service/`, `npm start` in `agribid/`). Check off each step;
note anything that breaks or feels slow.

## Farmer flow

- [ ] Sign up as a farmer, verify OTP, log in
- [ ] List a new crop with a valid price and quantity
- [ ] Confirm the listing appears in the dashboard immediately
- [ ] Open the Analytics panel for that crop — confirm price trend,
      forecast, and recommendation all load without errors
- [ ] Check the sell-now-vs-wait recommendation renders with a reason,
      not just a raw label
- [ ] Confirm a notification arrives when a buyer places a bid

## Buyer flow

- [ ] Sign up as a buyer, log in
- [ ] Browse listings, place a bid on a crop
- [ ] Confirm the bid amount validation rejects a bid below the
      current price (this is covered by an automated test already —
      just re-confirm it still holds through the actual UI, not just
      the API test)
- [ ] Accept flow: as the farmer, accept the buyer's bid
- [ ] Complete a payment through to a finished transaction

## Analytics-specific checks (the parts most likely to break silently)

- [ ] EDA report loads and shows seasonal patterns + correlation
      analysis without a 500 error
- [ ] Data quality report shows completeness % and invalid-value
      counts (not just missing-value counts)
- [ ] Bid anomaly detection shows method agreement
      (flaggedByAllThree/Two/OneOnly), not just a raw list
- [ ] Prediction explanation returns a SHAP-based explanation for a
      crop with enough listing history, and falls back to the
      rule-based explanation for one that doesn't — confirm both paths
      actually trigger, don't just check the "happy path"
- [ ] Decision backtest returns real numbers, not just an error, for
      at least one horizon value — if it always errors, that's a real
      finding for your report (not enough completed transactions yet),
      not a bug to hide

## What to do with the results

Any step that fails, is confusing, or is noticeably slow: note it in
your report as a known limitation or fix it if there's time before
submission. A checklist with 2-3 honestly-reported gaps is more
credible to an examiner than a claim that everything works perfectly
with no way to verify it.

## Added after the audit: checks worth doing by hand

- [ ] Call `/api/analytics/crops` with **no token** -> 401; with a farmer's token -> 200
- [ ] Analytics page: summary card appears first; detail sections are collapsed except forecasts
- [ ] Switch crop quickly several times -> the page ends on the last crop chosen (no stale data)
- [ ] Pick a crop with no history -> a friendly "no data yet" note, not a broken page
- [ ] List a crop with no photo -> with `PEXELS_API_KEY` set it gets a real photo of that crop
      (e.g. Orange shows an orange, Carrot a carrot); without it, a labelled icon
- [ ] Upload a 5 MB phone photo -> accepted (shrunk in the browser); upload a PDF -> rejected
- [ ] Chatbot: "price of tomato" -> badge *From marketplace data*; "how to control aphids"
      -> *General AI answer* (or the "not configured" note); "price of dragon fruit" -> asks which crop
- [ ] Companion tab: search "marigold", pair-check Tomato + Potato (avoid), open Wheat and Rice
- [ ] Kill the analytics service -> the Analytics page shows a clear error with Try again
- [ ] Log in with an expired token -> you are sent to the login page
