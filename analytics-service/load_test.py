"""
load_test.py - basic API load/response-time testing for AgriTrade AI.

Scope, honestly stated: this is "basic load testing" as your project
plan calls it - sequential and light concurrent request timing against
a locally running instance, not a production-grade load test (no
distributed load generation, no sustained-hours soak test). That's an
appropriate scope for a final-year project section, not a shortcoming
to hide - report it as "basic load testing", not "load testing".

Requires only the Python standard library (urllib, concurrent.futures,
statistics) - no `pip install` needed, so it runs anywhere Python 3
does, including on a machine with no internet access.

USAGE
-----
1. Start your Node backend (usually `npm run dev` in server/, port 5000)
   and your analytics service (`uvicorn app.main:app --reload` in
   analytics-service/, port 8000) locally first.
2. Make sure at least one crop exists in your database with a name
   that has some price/bid history - pass it with --crop if it isn't
   "Wheat".
3. Run:  python load_test.py --crop Wheat
4. Results print to the console and are also saved to
   load_test_results.json, ready to paste a table from into your report.
"""

import argparse
import json
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed


def _timed_request(url: str, timeout: float = 30.0):
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            response.read()
            status = response.status
    except urllib.error.HTTPError as e:
        status = e.code
    except Exception as e:
        return {"success": False, "error": str(e), "elapsedMs": None}
    elapsed_ms = (time.perf_counter() - start) * 1000
    return {"success": status < 500, "status": status, "elapsedMs": round(elapsed_ms, 1)}


def _summarize(timings_ms):
    if not timings_ms:
        return {"error": "No successful requests to summarize."}
    sorted_timings = sorted(timings_ms)
    p95_index = min(len(sorted_timings) - 1, int(len(sorted_timings) * 0.95))
    return {
        "count": len(timings_ms),
        "minMs": round(min(timings_ms), 1),
        "meanMs": round(statistics.mean(timings_ms), 1),
        "medianMs": round(statistics.median(timings_ms), 1),
        "p95Ms": round(sorted_timings[p95_index], 1),
        "maxMs": round(max(timings_ms), 1),
    }


def run_endpoint_test(name: str, url: str, sequential_requests: int, concurrent_requests: int):
    print(f"\n--- {name} ---")
    print(f"URL: {url}")

    # Sequential pass: realistic single-user response time.
    sequential_results = [_timed_request(url) for _ in range(sequential_requests)]
    sequential_ok = [r["elapsedMs"] for r in sequential_results if r["success"] and r["elapsedMs"] is not None]
    sequential_failures = [r for r in sequential_results if not r["success"]]

    # Light concurrent pass: several requests in flight at once, the
    # "basic load" part - not a sustained/ramping load test.
    concurrent_ok = []
    concurrent_failures = []
    if concurrent_requests > 0:
        with ThreadPoolExecutor(max_workers=concurrent_requests) as executor:
            futures = [executor.submit(_timed_request, url) for _ in range(concurrent_requests)]
            for future in as_completed(futures):
                result = future.result()
                if result["success"] and result["elapsedMs"] is not None:
                    concurrent_ok.append(result["elapsedMs"])
                else:
                    concurrent_failures.append(result)

    sequential_summary = _summarize(sequential_ok)
    concurrent_summary = _summarize(concurrent_ok) if concurrent_requests > 0 else None

    print(f"Sequential ({sequential_requests} requests, {len(sequential_failures)} failed): {sequential_summary}")
    if concurrent_summary is not None:
        print(f"Concurrent ({concurrent_requests} at once, {len(concurrent_failures)} failed): {concurrent_summary}")

    return {
        "endpoint": name,
        "url": url,
        "sequential": sequential_summary,
        "sequentialFailures": len(sequential_failures),
        "concurrent": concurrent_summary,
        "concurrentFailures": len(concurrent_failures) if concurrent_requests > 0 else None,
    }


def main():
    parser = argparse.ArgumentParser(description="Basic API load/response-time test for AgriTrade AI.")
    parser.add_argument("--crop", default="Wheat", help="Crop name to use for crop-specific endpoints.")
    parser.add_argument("--node-url", default="http://localhost:5000", help="Node backend base URL.")
    parser.add_argument("--analytics-url", default="http://localhost:8000", help="Analytics service base URL.")
    parser.add_argument("--sequential", type=int, default=10, help="Sequential requests per endpoint.")
    parser.add_argument("--concurrent", type=int, default=5, help="Concurrent requests per endpoint (0 to skip).")
    args = parser.parse_args()

    crop = urllib.parse.quote(args.crop)

    endpoints = [
        ("Node: GET /api/health", f"{args.node_url}/api/health"),
        ("Node: GET /api/crops", f"{args.node_url}/api/crops"),
        ("Analytics: price-trend", f"{args.analytics_url}/api/analytics/price-trend?cropName={crop}"),
        ("Analytics: eda-report", f"{args.analytics_url}/api/analytics/eda-report"),
        ("Analytics: data-quality", f"{args.analytics_url}/api/analytics/data-quality"),
        ("Analytics: price-prediction (Prophet)", f"{args.analytics_url}/api/analytics/price-prediction?cropName={crop}"),
        ("Analytics: backtest/price (walk-forward, heaviest endpoint)", f"{args.analytics_url}/api/analytics/backtest/price?cropName={crop}"),
        ("Analytics: prediction-explanation (SHAP)", f"{args.analytics_url}/api/analytics/prediction-explanation?cropName={crop}"),
        ("Analytics: bid-anomalies (3-method detection)", f"{args.analytics_url}/api/analytics/bid-anomalies"),
        ("Analytics: decision/sell-or-wait", f"{args.analytics_url}/api/analytics/decision/sell-or-wait?cropName={crop}"),
        ("Analytics: decision/backtest (heaviest endpoint)", f"{args.analytics_url}/api/analytics/decision/backtest"),
    ]

    print("=" * 70)
    print("AgriTrade AI - Basic API Load / Response-Time Test")
    print("Scope: sequential + light concurrent timing, single machine.")
    print("This is NOT a production-scale load test - report it as such.")
    print("=" * 70)

    results = []
    for name, url in endpoints:
        results.append(run_endpoint_test(name, url, args.sequential, args.concurrent))

    with open("load_test_results.json", "w") as f:
        json.dump(results, f, indent=2)

    print("\nSaved full results to load_test_results.json")


if __name__ == "__main__":
    main()