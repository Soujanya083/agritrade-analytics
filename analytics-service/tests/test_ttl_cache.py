"""The in-process cache used by the expensive analytics functions."""
import threading
import time

from app.utils import ttl_cache as cache_module
from app.utils.ttl_cache import cache_size, clear_cache, ttl_cache


def make_counter():
    calls = {"n": 0}

    @ttl_cache(seconds=60, data_aware=False)
    def work(x, flag=False):
        calls["n"] += 1
        return {"x": x, "flag": flag, "items": [1, 2, 3]}

    return work, calls


def test_identical_calls_compute_once():
    work, calls = make_counter()
    work(1)
    work(1)
    work(1)
    assert calls["n"] == 1


def test_different_arguments_compute_separately():
    work, calls = make_counter()
    work(1)
    work(2)
    work(1, flag=True)
    assert calls["n"] == 3


def test_errors_are_not_cached():
    calls = {"n": 0}

    @ttl_cache(seconds=60, data_aware=False)
    def flaky():
        calls["n"] += 1
        return {"error": "temporary"}

    flaky()
    flaky()
    assert calls["n"] == 2


def test_entries_expire_after_ttl(monkeypatch):
    work, calls = make_counter()
    now = {"t": 1000.0}
    monkeypatch.setattr(cache_module.time, "time", lambda: now["t"])
    work(1)
    now["t"] += 30
    work(1)
    assert calls["n"] == 1
    now["t"] += 31  # 61s since stored > 60s ttl
    work(1)
    assert calls["n"] == 2


def test_mutating_a_returned_value_does_not_corrupt_the_cache():
    work, _ = make_counter()
    first = work(1)
    first["items"].append(999)
    first["x"] = "tampered"
    second = work(1)
    assert second["items"] == [1, 2, 3]
    assert second["x"] == 1


def test_data_change_invalidates_cache(monkeypatch):
    calls = {"n": 0}

    @ttl_cache(seconds=600, data_aware=True)
    def report():
        calls["n"] += 1
        return {"n": calls["n"]}

    version = {"v": (1, 1, 1, 0)}
    monkeypatch.setattr(cache_module, "get_data_version", lambda: version["v"])
    report()
    report()
    assert calls["n"] == 1
    version["v"] = (2, 1, 1, 0)  # e.g. a new crop listing was added
    report()
    assert calls["n"] == 2


def test_unhashable_arguments_bypass_the_cache():
    calls = {"n": 0}

    @ttl_cache(seconds=60, data_aware=False)
    def f(values):
        calls["n"] += 1
        return {"sum": sum(values)}

    f([1, 2])
    f([1, 2])
    assert calls["n"] == 2


def test_concurrent_identical_requests_compute_once():
    """Single-flight: the dashboard fires several identical requests at once."""
    calls = {"n": 0}

    @ttl_cache(seconds=60, data_aware=False)
    def slow():
        calls["n"] += 1
        time.sleep(0.15)
        return {"ok": True}

    threads = [threading.Thread(target=slow) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert calls["n"] == 1


def test_cache_is_bounded(monkeypatch):
    monkeypatch.setattr(cache_module, "MAX_ENTRIES", 5)

    @ttl_cache(seconds=60, data_aware=False)
    def f(i):
        return {"i": i}

    for i in range(20):
        f(i)
    assert cache_size() <= 5


def test_clear_cache_empties_everything():
    work, calls = make_counter()
    work(1)
    clear_cache()
    work(1)
    assert calls["n"] == 2
    assert cache_size() == 1


def test_data_version_is_disabled_in_tests():
    from app.utils.data_version import get_data_version

    assert get_data_version() is None
