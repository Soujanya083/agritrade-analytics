import pytest

from app.utils.rate_limit import SlidingWindowLimiter


class Clock:
    def __init__(self):
        self.t = 1000.0
    def __call__(self):
        return self.t


def test_requests_over_the_limit_are_refused_with_a_retry_time():
    clock = Clock()
    limiter = SlidingWindowLimiter(3, 60, clock)
    assert [limiter.check("u")[0] for _ in range(3)] == [True, True, True]
    allowed, retry = limiter.check("u")
    assert allowed is False and 0 < retry <= 60


def test_the_window_slides_so_old_requests_stop_counting():
    clock = Clock()
    limiter = SlidingWindowLimiter(2, 60, clock)
    limiter.check("u"); clock.t += 30; limiter.check("u")
    assert limiter.check("u")[0] is False
    clock.t += 31                       # the first request is now 61 s old
    assert limiter.check("u")[0] is True


def test_each_user_has_their_own_allowance():
    limiter = SlidingWindowLimiter(1, 60, Clock())
    assert limiter.check("alice")[0] is True
    assert limiter.check("alice")[0] is False
    assert limiter.check("bob")[0] is True


def test_refused_requests_do_not_extend_the_block():
    clock = Clock()
    limiter = SlidingWindowLimiter(1, 60, clock)
    limiter.check("u")
    for _ in range(20):
        limiter.check("u")              # hammering while blocked
    clock.t += 61
    assert limiter.check("u")[0] is True


def test_quiet_keys_are_forgotten_so_memory_stays_bounded():
    clock = Clock()
    limiter = SlidingWindowLimiter(5, 60, clock)
    for i in range(400):
        limiter.check(f"user{i}")
    clock.t += 120
    for _ in range(200):
        limiter.check("busy")
    assert len(limiter._hits) < 50


def test_invalid_settings_are_rejected():
    with pytest.raises(ValueError):
        SlidingWindowLimiter(0, 60)
    with pytest.raises(ValueError):
        SlidingWindowLimiter(5, 0)
