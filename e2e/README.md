# End-to-end tests (Playwright)

These tests drive a real browser against the real stack: React site, Node API and MongoDB.
They cover what unit tests cannot: that the pieces work *together* (sign up with an OTP, log in,
stay logged in after a reload through the httpOnly refresh cookie, upload a crop, search, bid,
delete, and "Load more" pagination).

## Run locally

```bash
# 1. MongoDB running locally, then in three terminals:
cd server   && npm install && npm start           # API on :5000
cd agribid  && npm install && npm start           # site on :3000
# 2. then
cd e2e && npm install && npx playwright install chromium && npm test
```

Leave `EMAIL_PROVIDER` **unset** when starting the server: the tests read the OTP from the sign-up
response, which only happens in demo mode.

## Run like CI

```bash
cd agribid && npm run build && cd ..
cd e2e && E2E_START_SERVERS=1 npm test      # starts the API and serves the build itself
```

## If a test fails

`npx playwright show-report` opens an HTML report with a screenshot and a step-by-step trace.
Selectors use the visible labels and placeholders of the forms; if you rename a button, update
`helpers.js` and the spec files.
