"""
A small in-process sliding-window rate limiter for the analytics service.

Why: every analytics route needs a login, but a logged-in user (or a stolen token) could still call the
CPU-heavy forecast endpoints in a loop and starve a small server. The Node server already rate-limits; this
gives the Python service the same protection. In-process means each server instance counts on its own,
which is the right size for one small instance; use a shared store (Redis) if you ever run several.
"""
import threading
import time
from collections import deque


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: float = 60.0, clock=time.monotonic):
        if limit < 1 or window_seconds <= 0:
            raise ValueError("limit and window must be positive")
        self.limit, self.window, self._clock = limit, window_seconds, clock
        self._hits: dict[str, deque] = {}
        self._lock = threading.Lock()
        self._calls = 0

    def check(self, key: str) -> tuple[bool, float]:
        """(allowed, seconds_until_a_slot_frees). Counts the request only when it is allowed."""
        now = self._clock()
        with self._lock:
            self._calls += 1
            if self._calls % 500 == 0:       # forget keys that have gone quiet, so memory stays bounded
                for k in [k for k, q in self._hits.items() if not q or now - q[-1] > self.window]:
                    del self._hits[k]
            q = self._hits.setdefault(key, deque())
            while q and now - q[0] >= self.window:
                q.popleft()
            if len(q) >= self.limit:
                return False, max(0.0, self.window - (now - q[0]))
            q.append(now)
            return True, 0.0
