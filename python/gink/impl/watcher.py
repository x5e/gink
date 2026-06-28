from ctypes import CDLL, get_errno, c_int
from errno import EINTR
from os import strerror
from ctypes.util import find_library
from io import FileIO
from time import time as get_time
from os import fsencode, read
from typing import Optional, Protocol, Type, Union
from pathlib import Path
from select import select
import select as select_module
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
    _libc.srand(int(get_time() * 1e6))
    print(_libc.rand())


class _WatcherBackend(Protocol):
    closed: bool

    def fileno(self) -> int:
        """Return the selectable file descriptor."""

    def clear(self):
        """Clear any pending file change notifications."""

    def close(self):
        """Close any resources used by the watcher."""


class _InotifyWatcher(FileIO):
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


class _KqueueWatcher:
    def __init__(self, path: Union[Path, str]):
        self._file = FileIO(str(path), mode='rb')
        self._kqueue = select_module.kqueue()
        change = select_module.kevent(
            self._file.fileno(),
            filter=select_module.KQ_FILTER_VNODE,
            flags=select_module.KQ_EV_ADD | select_module.KQ_EV_CLEAR,
            fflags=(
                select_module.KQ_NOTE_WRITE
                | select_module.KQ_NOTE_EXTEND
                | select_module.KQ_NOTE_ATTRIB
                | select_module.KQ_NOTE_DELETE
                | select_module.KQ_NOTE_RENAME
                | select_module.KQ_NOTE_REVOKE
            ),
        )
        self._kqueue.control([change], 0, 0)

    @staticmethod
    def supported() -> bool:
        return hasattr(select_module, "kqueue")

    @property
    def closed(self) -> bool:
        return self._kqueue.closed

    def fileno(self) -> int:
        return self._kqueue.fileno()

    def clear(self):
        while self._kqueue.control([], 64, 0):
            pass

    def close(self):
        if not self._kqueue.closed:
            self._kqueue.close()
        self._file.close()


class Watcher:
    def __init__(self, path: Union[Path, str]):
        backend_class = self._get_backend_class()
        if backend_class is None:
            raise NotImplementedError("file watching is not supported on this platform")
        self._backend = backend_class(path)

    @staticmethod
    def _get_backend_class() -> Optional[Type[_WatcherBackend]]:
        if _InotifyWatcher.supported():
            return _InotifyWatcher
        if _KqueueWatcher.supported():
            return _KqueueWatcher
        return None

    @staticmethod
    def supported() -> bool:
        return Watcher._get_backend_class() is not None

    @property
    def closed(self) -> bool:
        return self._backend.closed

    def fileno(self) -> int:
        return self._backend.fileno()

    def clear(self):
        self._backend.clear()

    def close(self):
        self._backend.close()


if __name__ == "__main__":
    assert len(argv) == 2, "specify file to watch"
    watcher = Watcher(argv[1])
    while True:
        results = select([watcher], [], [])
        print("saw something at", get_time())
        watcher.clear()
