# AgriTrade frontend (React)

Create React App project. See the [root README](../README.md) for architecture, environment variables and tests.

```bash
npm install
npm start                      # http://localhost:3000
npm test -- --watchAll=false   # Jest + React Testing Library
npm run build                  # CI=true also treats ESLint warnings as errors
```

Environment (`.env.local`): `REACT_APP_API_BASE_URL`, `REACT_APP_ANALYTICS_BASE_URL`, optional `REACT_APP_UPI_ID` / `REACT_APP_UPI_NAME`.

Layout of the important parts:

| Path | What |
|---|---|
| `src/api/analyticsClient.js` | The only place that calls the analytics API: adds the JWT, maps HTTP status codes to friendly errors, shares in-flight identical requests |
| `src/components/Dashboard/AnalyticsPanel.js` | Decision-first analytics page (summary → collapsible detail sections → assistant) |
| `src/components/Dashboard/DecisionSummaryCard.js` | The "what this means for you" card |
| `src/components/Dashboard/ChatbotWidget.js` | Assistant with a source badge on every answer |
| `src/components/Companion/` + `src/data/companionPlanting.js` | Picture-first companion-planting tab; add a crop by adding one object to the data file |
| `src/components/Dashboard/listingImages.js` | Listing photo with graceful icon fallback |
| `src/utils/imageTools.js` | Shrinks uploaded photos in the browser; ISO date helper |
