""" implementation of the LogBackedStore class """
from typing import Tuple
from fcntl import flock, LOCK_EX, LOCK_NB
from ..builders.log_file_pb2 import LogFile
from .memory_store import MemoryStore
from .bundle_info import BundleInfo


class LogBackedStore(MemoryStore):
    """A Store backed by a simple append-only file."""

    def __init__(self, filepath, reset=False):
        MemoryStore.__init__(self)
        self._filepath = filepath
        self._handle = open(self._filepath, "ab+")
        flock(self._handle, LOCK_EX | LOCK_NB)
        if reset:
            self._handle.truncate()
        self._handle.seek(0)
        self._log_file_builder = LogFile()
        self._log_file_builder.ParseFromString(self._handle.read())  # type: ignore
        for bundle_bytes in self._log_file_builder.commits:  # type: ignore # pylint: disable=maybe-no-member
            MemoryStore.add_bundle(self, bundle_bytes=bundle_bytes)

    def add_bundle(self, bundle_bytes: bytes) -> Tuple[BundleInfo, bool]:
        if self._handle.closed:
            raise AssertionError("attempt to write to closed LogBackStore")
        bundle_info, added = MemoryStore.add_bundle(self, bundle_bytes)
        if added:
            self._log_file_builder.Clear()  # type: ignore
            self._log_file_builder.commits.push(bundle_bytes)  # type: ignore
            data: bytes = self._log_file_builder.SerializeToString()  # type: ignore
            self._handle.write(data)
        return bundle_info, added

    def get_claimed_chains(self):
        raise NotImplementedError()

    def close(self):
        """Closes the underlying file."""
        self._handle.close()
