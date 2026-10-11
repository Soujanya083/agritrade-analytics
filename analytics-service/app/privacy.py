"""
Pseudonymisation for marketplace-wide analytics.

Endpoints such as farmer-revenue, buyer-patterns, buyer-segments and
bid-anomalies are computed across ALL users. They used to return raw
MongoDB user ids (with each person's revenue / spend, or the fact that they
were flagged for suspicious bidding) to anyone who called the API.

Each id is replaced by a stable, non-reversible label (HMAC of the id), so
the dashboard can still rank, group and cross-reference rows, and mark the
viewer's own row (`isYou`) - but other users' identities are not exposed.
"""
import hashlib
import hmac
import secrets

from app import config

_USER_ID_KEYS = {"farmerId", "buyerId", "userId"}
_process_key = secrets.token_bytes(32)  # used only if no JWT secret is configured


def _key() -> bytes:
    secret = config.jwt_secret()
    return secret.encode() if secret else _process_key


def pseudonym(user_id: str) -> str:
    digest = hmac.new(_key(), f"user:{user_id}".encode(), hashlib.sha256).hexdigest()
    return f"User-{digest[:6]}"


def pseudonymize(value, viewer_id: str | None = None):
    """Recursively replace user-id fields in dicts/lists; adds `isYou` next to each one."""
    if isinstance(value, list):
        return [pseudonymize(item, viewer_id) for item in value]
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if k in _USER_ID_KEYS and v is not None:
                out[k] = pseudonym(str(v))
                out["isYou"] = bool(viewer_id) and str(v) == viewer_id
            else:
                out[k] = pseudonymize(v, viewer_id)
        return out
    return value
