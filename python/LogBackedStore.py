from log_file_pb2 import LogFile
from MemoryStore import MemoryStore

class LogBackedStore(MemoryStore):
    
    def __init__(self, filepath, reset=False):
        MemoryStore.__init__(self)
        self._filepath = filepath
        with open(self._filepath, "ab+") as handle:
            handle.seek(0)
            logFileBuilder = LogFile()
            logFileBuilder.ParseFromString(handle.read())  # type: ignore
            for changeSetBytes in logFileBuilder.commits:  # type: ignore
                self.add_commit(changeSetBytes=changeSetBytes)
