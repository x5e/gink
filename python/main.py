#!/usr/bin/env python3
import sys
from LogBackedStore import LogBackedStore
from LmdbStore import LmdbStore
from AbstractStore import AbstractStore
from change_set_pb2 import ChangeSet as ChangeSetBuilder
from ChangeSetInfo import ChangeSetInfo

def show(file: str):
    store: AbstractStore
    builder = ChangeSetBuilder()
    if file.endswith(".gink.mdb"):
        store = LmdbStore(file)
    else:
        store = LogBackedStore(file)
    def dump(data: bytes, info: ChangeSetInfo):
        builder.ParseFromString(data)  # type: ignore
        print("=" * 40)
        print(info)
        print(builder)
    store.get_commits(dump)
    store.close()
    

if __name__ == "__main__":
    func = sys.argv[1]
    args = sys.argv[2:]
    globals()[func](*args)
