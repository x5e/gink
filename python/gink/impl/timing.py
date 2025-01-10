from datetime import datetime as DateTime, timedelta
import threading
from typing import Dict, List
#from .logging_stuff import info
# from .stats import print_dist
from functools import wraps
__all__ = ["report", "timing", "Timer", "measure"]
_times: Dict[str, List[timedelta]] = dict()
_lock = threading.Lock()
info = print


def report(cls):
    for k, v in cls.times.items():
        info("times for:", k)
        #print_dist(v)
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
        #info("starting", func.__name__)
        start = DateTime.now()
        try:
            out = func(*a, **b)
        finally:
            end = DateTime.now()
            elapsed = end - start
            info("finished", func.__name__, " in ", elapsed)
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

    def __exit__(self, *a, **b):
        end = DateTime.now()
        elapsed = end - self.start
        if self.verbose:
            info("finished Timer for ", self.name, " in ", elapsed)
        with _lock:
            obs = _times.get(self.name)
            if obs is None:
                obs = _times.setdefault(self.name, [])
            obs.append(elapsed)


def measure(f, *a, **b):
    start = DateTime.now()
    out = f(*a, **b)
    ending = DateTime.now()
    elapsed = ending - start
    info("measure: %s ran in %s" % (f.__name__, elapsed))
    return out
