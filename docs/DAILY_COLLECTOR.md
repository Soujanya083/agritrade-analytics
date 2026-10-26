# Daily price collector

The government feed only shows **today's** prices, and your imported history ends on 2025-06-11. This job saves each day's prices for Onion, Potato, Tomato and Wheat, so the real history grows again. Re-running is safe: a record already saved is skipped.

## Switch it on (once)
1. GitHub, your repository, **Settings > Secrets and variables > Actions > Secrets > New repository secret**. Add three: `MONGO_URI` (the Atlas address, same as on Render), `DATAGOVIN_API_KEY`, `DATAGOVIN_RESOURCE_ID` (`9ef84268-d588-465a-a308-a864a43d0070`). Never put them in a file.
2. **Variables** tab > New repository variable: name `ENABLE_DAILY_MANDI`, value `true`.
3. **Actions** tab > "Daily mandi prices" > **Run workflow** to test it once. Then check the Atlas collection `mandi_prices` or run `python scripts/import_mandi_prices.py summary` against Atlas.
4. Atlas must accept connections from GitHub's servers (Network Access > allow access from anywhere). That is a security trade-off: keep a strong database password, and turn the job off with `ENABLE_DAILY_MANDI=false` if you stop using it.

## Be honest about what you get
- The feed can be partial on a given day (some states had no Onion records today), so a day may hold fewer markets than usual. That is real data, not an error.
- There is now a **gap** between 2025-06-11 and the first collected day. The forecasts only use the unbroken stretch after the gap, so **forecasts for a crop come back after about 120 days** of collection (the app says "need at least 120 days" until then). Seasonality needs about two years.
- Storage: about 1,000 records a day for four crops. Measured earlier at roughly 385 bytes per record including indexes, that is about 0.4 MB a day, **about 140 MB a year**. Your imported history already uses about 280 MB of the 512 MB free Atlas limit, so after a year you are near 420 MB. To save space, edit the crop list in `.github/workflows/daily-mandi.yml` (for example only Onion and Potato), or delete old Wheat and Tomato rows. Check the storage figure on the Atlas dashboard now and then.
- GitHub pauses scheduled jobs in a repository with no activity for about two months; re-enable it in the Actions tab if that happens.
