from ctypes import CDLL, get_errno, c_int
from errno import EINTR
from os import strerror
from ctypes.util import find_library
from io import FileIO
from time import time as get_time
from os import fsencode, read
from typing import Union
from pathlib import Path
from select import select
from sys import argv
from fcntl import ioctl
from termios import FIONREAD

__all__ = ["libc_rand", "Watcher"]

MODIFY = 2
ATTRIB = 4

try:
    libc_so = find_library('c')
except RuntimeError:
    libc_so = None

_libc = CDLL(libc_so or 'libc.so.6', use_errno=True)


def _libc_call(function, *args):
    while True:
        rc = function(*args)
        if rc != -1:
            return rc
        errno = get_errno()
        if errno != EINTR:
            raise OSError(errno, strerror(errno))


def libc_rand():
    _libc.srand(int(get_time()*1e6))
    print(_libc.rand())


class Watcher(FileIO):
    def __init__(self, path: Union[Path, str]):
        super().__init__(_libc_call(_libc.inotify_init1, 0), mode='rb')
        _libc_call(_libc.inotify_add_watch, self.fileno(), fsencode(str(path)), MODIFY | ATTRIB)
        self._bytes_available = c_int()

    @staticmethod
    def supported() -> bool:
        return hasattr(_libc, "inotify_init1")

    def clear(self):
        ioctl(self.fileno(), FIONREAD, self._bytes_available)
        if self._bytes_available:
            read(self.fileno(), self._bytes_available.value)


if __name__ == "__main__":
    assert len(argv) == 2, "specify file to watch"
    watcher = Watcher(argv[1])
    while True:
        results = select([watcher], [], [])
        print("saw something at", get_time())
        watcher.clear()
