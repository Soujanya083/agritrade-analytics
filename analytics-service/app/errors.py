"""
Maps the analytics services' internal "error dict" convention
(`{"error": "..."}`) onto proper HTTP status codes.

History: every service returned `{"error": ...}` and the router passed it
straight through, so a missing crop, a validation problem and an upstream
outage all came back as HTTP 200 (and the one route with a response_model
actually 500'd on the error shape). The services keep their internal
contract (other services, the chatbot and the tests all branch on
`"error" in result`), and the HTTP layer translates it in ONE place.

classify_error() is deliberately pure and exhaustively unit-tested against
every message the services can currently produce, so a reworded message
can't silently change a status code.
"""
import re

# Ordered: first match wins.
_RULES: list[tuple[re.Pattern, int]] = [
    # Upstream / configuration problems -> 503 Service Unavailable
    (re.compile(r"credentials not configured|not configured", re.I), 503),
    # Our own failure while computing -> 500
    (re.compile(r"clustering failed|column not found|missing the expected|could not find a bid amount column", re.I), 500),
    # Bad caller input -> 422 Unprocessable Entity
    (re.compile(r"must be at least|cannot exceed|must be (a )?positive", re.I), 422),
    # Not enough data to compute a meaningful answer -> 422
    (re.compile(r"not enough|need more than|at least \d+ data points", re.I), 422),
    # The requested crop/commodity has no data at all -> 404
    (re.compile(r"no (valid )?(price|demand|transaction) history found|no mandi price records found|unknown crop|no imported mandi history", re.I), 404),
    # Marketplace-wide "nothing recorded yet" -> 422 (the resource exists, the data doesn't yet)
    (re.compile(r"^no .*(data|sales|bidding)", re.I), 422),
    (re.compile(r"no usable price field|none had a usable price", re.I), 404),
]

DEFAULT_ERROR_STATUS = 422


def classify_error(message: str) -> int:
    text = str(message or "")
    for pattern, status in _RULES:
        if pattern.search(text):
            return status
    return DEFAULT_ERROR_STATUS


def is_error_result(result) -> bool:
    return isinstance(result, dict) and "error" in result and bool(result["error"])
