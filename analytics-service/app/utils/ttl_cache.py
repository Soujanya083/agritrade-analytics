"""
In-process TTL cache for the expensive analytics/ML functions.

Why in-memory and not Redis: this service runs as one FastAPI process on a
single small instance. A dict is the right-sized tool; Redis would be extra
infrastructure to run, secure and pay for with no benefit at this scale.
The one honest limitation: with `uvicorn --workers N` every worker has its
own cache, so a request can still land on a cold worker. Revisit only if
the deployment ever scales out.

What this adds over the original version
  * thread-safe (FastAPI runs sync endpoints in a thread pool)
  * single-flight: N identical concurrent requests compute ONCE and share
    the result (the dashboard fires several requests for the same crop at
    the same instant)
  * bounded size (LRU) so it can't grow without limit
  * results are deep-copied on the way out, so a caller that mutates a
    cached dict can't corrupt the next caller's answer
  * `data_aware=True` folds a data fingerprint into the key, so a new
    bid/sale invalidates the cached value immediately (see data_version.py)
  * errors are never cached
"""
import copy
import functools
import threading
import time
from collections import OrderedDict

from app.errors import is_error_result
from app.utils.data_version import get_data_version

MAX_ENTRIES = 256

_MISS = object()
_store: "OrderedDict[tuple, tuple]" = OrderedDict()
_store_lock = threading.RLock()
_key_locks: dict = {}


def _lookup(key, seconds):
    with _store_lock:
        entry = _store.get(key)
        if entry is None:
            return _MISS
        value, stored_at = entry
        if time.time() - stored_at >= seconds:
            _store.pop(key, None)
            return _MISS
        _store.move_to_end(key)
        return copy.deepcopy(value)


def _save(key, value):
    with _store_lock:
        _store[key] = (copy.deepcopy(value), time.time())
        _store.move_to_end(key)
        while len(_store) > MAX_ENTRIES:
            _store.popitem(last=False)


def _lock_for(key):
    with _store_lock:
        return _key_locks.setdefault(key, threading.Lock())


def ttl_cache(seconds=300, data_aware=True):
    """Cache a function's result per distinct arguments for `seconds`."""

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            version = get_data_version() if data_aware else None
            key = (func.__module__, func.__qualname__, args, tuple(sorted(kwargs.items())), version)
            try:
                hash(key)
            except TypeError:  # unhashable argument: just don't cache
                return func(*args, **kwargs)

            hit = _lookup(key, seconds)
            if hit is not _MISS:
                return hit

            with _lock_for(key):  # single-flight
                hit = _lookup(key, seconds)
                if hit is not _MISS:
                    return hit
                try:
                    result = func(*args, **kwargs)
                    if not is_error_result(result):
                        _save(key, result)
                    return result
                finally:  # don't leak one lock object per distinct key forever
                    with _store_lock:
                        _key_locks.pop(key, None)

        wrapper.cache_clear = clear_cache
        return wrapper

    return decorator


def clear_cache():
    """Drop every cached value (used by tests and after bulk data changes)."""
    with _store_lock:
        _store.clear()
        _key_locks.clear()


def cache_size() -> int:
    with _store_lock:
        return len(_store)
