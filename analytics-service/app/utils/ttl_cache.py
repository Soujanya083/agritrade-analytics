"""
Simple in-process TTL (time-to-live) cache, used for the heaviest ML
endpoints (walk-forward backtesting, K-Means clustering) so they don't
recompute from scratch on every single request - this was flagged as
a real gap, and is very likely the actual cause of "long time to load"
complaints on the Analytics tab, since every chart re-triggers a full
recomputation on each crop/state/quantity change.

Deliberately NOT Redis or any external cache: this project runs as a
single FastAPI process, so an in-memory dict is the right-sized
solution - adding a separate caching service would be more
infrastructure than this project's actual scale justifies. The one
honest limitation: if you ever run multiple worker processes (e.g.
`uvicorn --workers 4`), each worker has its own separate cache, so a
request could still hit a "cold" worker - fine for a single-process
deployment, worth revisiting only if this project's deployment scale
changes.
"""
import time
import functools

_cache_store = {}


def ttl_cache(seconds=300):
    """Decorator: caches a function's return value per unique set of
    arguments for `seconds`. Errors are not cached - a transient failure
    (e.g. Prophet failing to converge once) shouldn't be remembered and
    served stale for the next 5 minutes."""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            key = (func.__module__, func.__name__, args, tuple(sorted(kwargs.items())))
            now = time.time()
            cached = _cache_store.get(key)
            if cached and (now - cached[1]) < seconds:
                return cached[0]

            result = func(*args, **kwargs)
            if isinstance(result, dict) and "error" in result:
                return result  # don't cache errors
            _cache_store[key] = (result, now)
            return result
        return wrapper
    return decorator


def clear_cache():
    """Exposed for tests - clears every cached entry."""
    _cache_store.clear()