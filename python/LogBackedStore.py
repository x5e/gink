from fcntl import flock, LOCK_EX, LOCK_NB
from log_file_pb2 import LogFile
from MemoryStore import MemoryStore
from ChangeSetInfo import ChangeSetInfo
from typing import Tuple

class LogBackedStore(MemoryStore):
    
    def __init__(self, filepath, reset=False):
        MemoryStore.__init__(self)
        self._filepath = filepath
        self._handle = open(self._filepath, "ab+")
        flock(self._handle, LOCK_EX | LOCK_NB)
        if reset:
            self._handle.truncate()
        self._handle.seek(0)
        self._logFileBuilder = LogFile()
        self._logFileBuilder.ParseFromString(handle.read())  # type: ignore
        for changeSetBytes in self._logFileBuilder.commits:  # type: ignore
            MemoryStore.add_commit(self, changeSetBytes=changeSetBytes)

    def add_commit(self, changeSetBytes: bytes) -> Tuple[ChangeSetInfo, bool]:
        if self._handle.closed:
            raise AssertionError("attempt to write to closed LogBackStore")
        changeSetInfo, added = MemoryStore.add_commit(self, changeSetBytes=changeSetBytes)
        if added:
            self._logFileBuilder.Clear()  # type: ignore
            self._logFileBuilder.commits.push(changeSetBytes)  # type: ignore
            data: bytes = self._logFileBuilder.SerializeToString()  # type: ignore
            self._handle.write(data)
        return changeSetInfo, added

    def close(self):
        self._handle.close()
