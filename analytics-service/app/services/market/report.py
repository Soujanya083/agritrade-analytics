"""
Reproducible analysis report for one commodity, built ONLY from the project's
own analysis functions (nothing is hand-written or hard-coded), so every
number in the report can be regenerated with one command:

    python scripts/generate_market_report.py --commodity Onion --state Maharashtra

`build_report` is pure (series in, text + figures out) so it is unit-tested.
Figures need matplotlib (optional); without it the report is text-only.
"""
from datetime import date

import pandas as pd

from app.services.market import market_overview
from app.services.market.forecast_lab import run_forecast_lab


def _figures(series: pd.Series, lab: dict, overview: dict) -> dict:
    """Returns {filename: matplotlib figure}. Empty if matplotlib is not installed."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception:
        return {}

    figures = {}

    fig, ax = plt.subplots(figsize=(9, 4))
    history = series.iloc[-180:]
    ax.plot(history.index, history.values, color="#2e7d32", label="Real price (Rs/kg)")
    f = pd.DataFrame(lab["forecast"])
    f["date"] = pd.to_datetime(f["date"])
    ax.plot(f["date"], f["point"], color="#ef6c00", lw=2, label=f"Forecast: {lab['champion']['label']}")
    ax.fill_between(f["date"], f["lower"], f["upper"], color="#ffb74d", alpha=0.35, label="90% interval")
    ax.set_title("Price history and forecast")
    ax.set_ylabel("Rs per kg")
    ax.legend()
    ax.grid(alpha=0.3)
    fig.autofmt_xdate()
    figures["forecast.png"] = fig

    fig, ax = plt.subplots(figsize=(9, 3.6))
    board = lab["leaderboard"]
    colors = ["#2e7d32" if r["model"] == lab["champion"]["model"] else "#90a4ae" for r in board]
    ax.barh([r["label"] for r in board][::-1], [r["MASE"] for r in board][::-1], color=colors[::-1])
    ax.axvline(next(r["MASE"] for r in board if r["model"] == "naive"), color="#c62828", ls="--", label="naive")
    ax.set_xlabel("MASE (lower is better; 1.0 = naive one-day change)")
    ax.set_title("Rolling-origin backtest")
    ax.legend()
    fig.tight_layout()
    figures["leaderboard.png"] = fig

    seasonality = overview["seasonality"]
    if seasonality.get("index"):
        fig, ax = plt.subplots(figsize=(9, 3.4))
        ax.bar([r["month"] for r in seasonality["index"]], [r["index"] for r in seasonality["index"]], color="#5c6bc0")
        ax.axhline(1.0, color="#999", lw=1)
        ax.set_ylim(0.7, 1.3)
        ax.set_title("Seasonal price index (1.00 = typical)" + ("" if seasonality["reliable"] else " - UNRELIABLE (< 2 years)"))
        fig.tight_layout()
        figures["seasonality.png"] = fig

    pred = lab.get("predictability", {})
    if pred.get("available"):
        fig, ax = plt.subplots(figsize=(9, 3.2))
        ax.bar([a["lag"] for a in pred["acf"]], [a["value"] for a in pred["acf"]], color="#7e57c2")
        ax.axhline(pred["acfBand95"], color="#c62828", ls="--")
        ax.axhline(-pred["acfBand95"], color="#c62828", ls="--")
        ax.set_title("Autocorrelation of daily returns (dashed = 95% noise band)")
        ax.set_xlabel("lag (days)")
        fig.tight_layout()
        figures["acf.png"] = fig
    return figures


def build_report(series: pd.Series, df: pd.DataFrame, commodity: str, state: str | None, quality: dict,
                 horizon: int = 14) -> tuple[str, dict]:
    lab = run_forecast_lab(series, horizon)
    if "error" in lab:
        return f"# {commodity}: report not possible\n\n{lab['error']}\n", {}
    overview = market_overview.overview(series, df, commodity, state)
    figures = _figures(series, lab, overview)
    scope = state or "All India"
    champ, pred, eco = lab["champion"], lab["predictability"], lab["economicValue"]
    lines = [
        f"# {commodity} ({scope}): real-market analysis",
        f"*Generated {date.today().isoformat()} from imported AGMARKNET data. Every figure below is produced by the project's analysis code.*",
        "",
        "## 1. Data",
        f"- {quality['daysInSeries']} daily observations, {quality['firstDate']} to {quality['lastDate']}, "
        f"from {quality['marketsContributing']} markets.",
        f"- Unit: {quality['unit']}. Daily value = median across markets.",
        f"- Forward-filled days (gaps of up to 3 days): {quality['forwardFilledDays']}. Cut at a longer gap: {quality['cutAtLongGap']}.",
        f"- Extreme one-day moves flagged (kept in the data): {quality['extremeMoves']['count']}.",
        f"- Days since last observation: {quality['daysSinceLastObservation']}.",
        "",
        "## 2. Is the price predictable at all?",
        f"**{pred['classification']}.** {pred['reading']}",
        f"- Ljung-Box (10 lags) p = {pred['ljungBox']['pValue']}",
        "- Variance ratios: " + ", ".join(f"{v['q']}-day {v['vr']} (p={v['pValue']})" for v in pred["varianceRatios"]),
        "![acf](acf.png)" if "acf.png" in figures else "",
        "",
        f"## 3. Forecast ({horizon} days)",
        f"**Champion: {champ['label']}.** {champ['reason']}",
        "![forecast](forecast.png)" if "forecast.png" in figures else "",
        "",
        "| Day | Forecast (Rs/kg) | 90% interval |", "|---|---|---|",
        *[f"| {row['date']} | {row['point']} | {row['lower']} - {row['upper']} |" for row in lab["forecast"][:: max(1, horizon // 7)]],
        "",
        f"Interval check: calibrated on the older half of the test points, the 90% interval covered the real price "
        f"{lab['intervalCoverage']['empirical']} of the time on the newer half ({lab['intervalCoverage']['origins']} test points).",
        "",
        "## 4. Model comparison (rolling-origin backtest)",
        f"{lab['evaluation']['method']}; {lab['evaluation']['origins']} forecast origins over the last {lab['evaluation']['testWindowDays']} days.",
        "![leaderboard](leaderboard.png)" if "leaderboard.png" in figures else "",
        "",
        "| Model | MASE | MAE (Rs/kg) | sMAPE % | Wins vs naive | p (Holm-corrected) |", "|---|---|---|---|---|---|",
        *[f"| {r['label']} | {r['MASE']} | {r['MAE']} | {r['sMAPE']} | {r['winRateVsNaive'] if r['winRateVsNaive'] is not None else '-'} | "
          f"{r['dmPValueAdjusted'] if r['dmPValueAdjusted'] is not None else '-'} |" for r in lab["leaderboard"]],
        "",
        "A model counts as better only if it beats naive on MASE and the Diebold-Mariano test is significant after "
        "Holm correction for testing several models.",
        "",
        "## 5. Would following the forecast have paid?",
        eco["verdict"],
        f"- Per decision over {eco['decisions']} past test points (wait only if a rise of {eco['waitThresholdPct']}%+ was forecast): "
        f"following the forecast {eco['followForecast']['meanGainPct']}% (95% interval {eco['followForecast']['ci95'][0]}% to "
        f"{eco['followForecast']['ci95'][1]}%); always waiting {eco['alwaysWait']['meanGainPct']}%; selling now 0%.",
        "- " + " ".join(eco["caveats"]),
        "",
        "## 6. Seasonality, volatility and markets",
    ]
    s = overview["seasonality"]
    lines.append(f"- Seasonality: {s['note']}" + (f" Highest: {', '.join(s['highestMonths'])}; lowest: {', '.join(s['lowestMonths'])}." if s.get("highestMonths") else ""))
    lines.append("![seasonality](seasonality.png)" if "seasonality.png" in figures else "")
    v = overview["volatility"]
    if v.get("available"):
        lines.append(f"- Volatility: {v['level']} ({v['latestVolatilityPct']}% over {v['windowDays']} days; {v['percentileVsHistory']}th percentile of its own history).")
    y = overview["yearOnYear"]
    if y.get("available"):
        lines.append(f"- Versus a year ago: {y['changePct']:+}% (Rs {y['yearAgoPerKg']} -> Rs {y['currentPerKg']} per kg).")
    m = overview["marketSpread"]
    if m.get("available"):
        lines.append(f"- Market spread over the last {m['windowDays']} days: {m['spreadPct']}% across {m['marketsCompared']} markets; "
                     f"highest {m['highest'][0]['market']} (Rs {m['highest'][0]['medianPerKg']}/kg), lowest {m['lowest'][0]['market']} "
                     f"(Rs {m['lowest'][0]['medianPerKg']}/kg).")
    lines += ["", "## 7. Limitations", *[f"- {c}" for c in lab["caveats"]],
              "- Weather, policy changes and export restrictions are not modelled.",
              "- Wholesale mandi prices are not the price a farmer receives at the farm gate."]
    return "\n".join(l for l in lines if l is not None) + "\n", figures
