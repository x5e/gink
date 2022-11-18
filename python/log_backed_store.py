from typing import Tuple
from fcntl import flock, LOCK_EX, LOCK_NB
from log_file_pb2 import LogFile
from MemoryStore import MemoryStore
from change_set_info import ChangeSetInfo


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
        for change_set_bytes in self._log_file_builder.commits:  # type: ignore # pylint: disable=maybe-no-member
            MemoryStore.add_commit(self, changeSetBytes=change_set_bytes)

    def add_commit(self, changeSetBytes: bytes) -> Tuple[ChangeSetInfo, bool]:
        if self._handle.closed:
            raise AssertionError("attempt to write to closed LogBackStore")
        change_set_info, added = MemoryStore.add_commit(self, changeSetBytes=changeSetBytes)
        if added:
            self._log_file_builder.Clear()  # type: ignore
            self._log_file_builder.commits.push(changeSetBytes)  # type: ignore
            data: bytes = self._log_file_builder.SerializeToString()  # type: ignore
            self._handle.write(data)
        return change_set_info, added

    def close(self):
        """Closes the underlying file."""
        self._handle.close()
