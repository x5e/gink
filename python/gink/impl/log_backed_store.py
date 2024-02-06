""" implementation of the LogBackedStore class """
from typing import Optional, Callable, Union
from fcntl import flock, LOCK_EX, LOCK_NB, LOCK_UN
from .builders import LogFile
from .memory_store import MemoryStore
from .bundle_info import BundleInfo
from .bundle_wrapper import BundleWrapper



class LogBackedStore(MemoryStore):
    """A Store backed by a simple append-only file."""

    def __init__(self, filepath, *, exclusive=False, reset=False):
        MemoryStore.__init__(self)
        self._filepath = filepath
        self._handle = open(self._filepath, "ab+")
        self._exclusive = exclusive
        if self._exclusive:
            flock(self._handle, LOCK_EX | LOCK_NB)  # this will throw if another process has a lock
        if reset:
            self._handle.truncate()
        self._handle.seek(0)
        self._log_file_builder = LogFile()
        self._log_file_builder.ParseFromString(self._handle.read())  # type: ignore
        for bundle_bytes in self._log_file_builder.commits:  # type: ignore # pylint: disable=maybe-no-member
            MemoryStore.apply_bundle(self, bundle_bytes=bundle_bytes)

    def refresh(self):
        pass

    def apply_bundle(self, bundle: Union[BundleWrapper, bytes], callback: Optional[Callable]=None) -> bool:
        if self._handle.closed:
            raise AssertionError("attempt to write to closed LogBackStore")
        if isinstance(bundle, bytes):
            bundle = BundleWrapper(bundle)
        if not self._exclusive:
            flock(self._handle, LOCK_EX)  # this will block (wait) if another process has a lock
        added = MemoryStore.apply_bundle(self, bundle)
        if added:
            self._log_file_builder.Clear()  # type: ignore
            self._log_file_builder.commits.push(bundle_bytes)  # type: ignore
            data: bytes = self._log_file_builder.SerializeToString()  # type: ignore
            self._handle.write(data)
            self._handle.flush()
            if callback is not None:
                callback(bundle)
        if not self._exclusive:
            flock(self._handle, LOCK_UN)
        return added

    def get_claimed_chains(self):
        raise NotImplementedError()

    def close(self):
        """Closes the underlying file."""
        self._handle.close()
