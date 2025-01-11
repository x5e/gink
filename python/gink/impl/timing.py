from datetime import datetime as DateTime, timedelta
import threading
from typing import Dict, List
#from .logging_stuff import info
# from .stats import print_dist
from functools import wraps
__all__ = ["report_timing", "timing", "Timer"]
_times: Dict[str, List[timedelta]] = dict()
_lock = threading.Lock()
info = print
from copy import copy


def print_dist(vec, render=str, display=info):
    vec = copy(vec)
    vec.sort()
    n = len(vec)
    display("N = %s" % n)
    if n == 1:
        display("value=", render(vec[0]))
        return
    display("min   : ", render(vec[0]))
    display(".001  : ", render(vec[int(n * 1 / 1000)]))
    display(" 1st  : ", render(vec[int(n * 1 / 100)]))
    display(" 5th  : ", render(vec[int(n * 5 / 100)]))
    display("25th  : ", render(vec[int(n / 4)]))
    display("50th  : ", render(vec[int(n / 2)]))
    display("75th  : ", render(vec[int(n * 3 / 4)]))
    display("95th  : ", render(vec[int(n * 95 / 100)]))
    display("99th  : ", render(vec[int(n * 99 / 100)]))
    display(".999  : ", render(vec[int(n * 999 / 1000)]))
    display("max   : ", render(vec[n - 1]))


def report_timing():
    for k, v in _times.items():
        info("times for:", k)
        print_dist(v)
        try:
            total = None
            for obs in v:
                if total is None:
                    total = obs
                else:
                    total = total + obs
            info("total=", total, "\n\n")
        except Exception:
            pass


def timing(func):
    @wraps(func)
    def wrapper(*a, **b):
        start = DateTime.now()
        try:
            out = func(*a, **b)
        finally:
            end = DateTime.now()
            elapsed = end - start
            with _lock:
                obs = _times.get(func.__name__)
                if obs is None:
                    obs = _times.setdefault(func.__name__, [])
                obs.append(elapsed)
        return out
    return wrapper


class Timer(object):

    __slots__ = ["name", "reporting", "verbose", "start"]

    def __init__(self, what: str, verbose=True, ):
        if isinstance(what, str):
            self.name = what
        else:
            raise ValueError("unexpected argument to Timer: %s %s" % (type(what), what))
        self.verbose = verbose

    def __enter__(self):
        if self.verbose:
            info("starting Timer for ", self.name)
        self.start = DateTime.now()

    def __exit__(self, *_):
        end = DateTime.now()
        elapsed = end - self.start
        if self.verbose:
            info("finished Timer for ", self.name, " in ", elapsed)
        with _lock:
            obs = _times.get(self.name)
            if obs is None:
                obs = _times.setdefault(self.name, [])
            obs.append(elapsed)
