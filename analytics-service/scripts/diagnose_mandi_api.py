"""
Shows what the data.gov.in mandi API really answers (the app hides this and falls back to a snapshot).
Prints status codes and counts only - never your API key.

Run from analytics-service with the venv active:
    python scripts/diagnose_mandi_api.py                 (5 requests, 25 s wait each)
    python scripts/diagnose_mandi_api.py --quick 120     (1 small request, waits up to 120 s)
    python scripts/diagnose_mandi_api.py --ua            (same request with 3 different User-Agent headers)
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv()
from app import config  # noqa: E402

key, rid = config.mandi_credentials()
print(f"key set: {bool(key)} | key length: {len(key or '')} | resource id: {rid}")
if not key or not rid:
    sys.exit("Stopped: the key or resource id is not being read. Check analytics-service/.env and restart the terminal.")

URL = f"https://api.data.gov.in/resource/{rid}"
WAIT = 25
if len(sys.argv) > 1 and sys.argv[1] == "--ua":
    agents = [
        ("default python-requests (what the app sends now)", None),
        ("honest custom name", "AgriTradeAnalytics/1.0 (student project; mandi price lookup)"),
        ("browser-like", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    ]
    for label, agent in agents:
        started = time.time()
        try:
            headers = {"User-Agent": agent} if agent else {}
            r = requests.get(URL, params={"api-key": key, "format": "json", "limit": 1,
                                          "filters[commodity]": "Onion"}, headers=headers, timeout=30)
            j = r.json() if r.ok else {}
            print(f"{label}\n   HTTP {r.status_code} in {time.time() - started:.1f}s | total={j.get('total')} count={j.get('count')}")
        except Exception as error:
            print(f"{label}\n   ERROR {type(error).__name__} after {time.time() - started:.1f}s: {str(error).replace(key, '<key>')[:100]}")
    sys.exit(0)
if len(sys.argv) > 1 and sys.argv[1] == "--quick":
    WAIT = int(sys.argv[2]) if len(sys.argv) > 2 else 120
tries = [
    ("1. no filters", {}),
    ("2. Onion", {"filters[commodity]": "Onion"}),
    ("3. Onion + state.keyword=Karnataka", {"filters[commodity]": "Onion", "filters[state.keyword]": "Karnataka"}),
    ("4. Onion + state=Karnataka", {"filters[commodity]": "Onion", "filters[state]": "Karnataka"}),
    ("5. Onion + state.keyword=Maharashtra", {"filters[commodity]": "Onion", "filters[state.keyword]": "Maharashtra"}),
]
if WAIT != 25:
    tries = tries[:1]
for label, extra in tries:
    started = time.time()
    try:
        r = requests.get(URL, params={"api-key": key, "format": "json", "limit": 1 if WAIT != 25 else 3, **extra}, timeout=WAIT)
        took = time.time() - started
        try:
            j = r.json()
        except ValueError:
            j = {}
        first = (j.get("records") or [{}])[0]
        msg = str(j.get("message") or j.get("error") or "")[:100]
        print(f"{label}\n   HTTP {r.status_code} in {took:.1f}s | total={j.get('total')} count={j.get('count')} "
              f"| newest sample date={first.get('arrival_date')} | note={msg or '-'}")
    except Exception as error:  # never print the URL: it contains the key
        text = str(error).replace(key, "<key>")[:140]
        print(f"{label}\n   ERROR {type(error).__name__} after {time.time() - started:.1f}s: {text}")
print("\nThe app waits only 6 seconds. If any request above took longer than that, a timeout is the cause.")
