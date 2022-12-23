#!/usr/bin/env python3
""" command line tool to view/maniplulate stores """
import sys
from log_backed_store import LogBackedStore
from lmdb_store import LmdbStore
from abstract_store import AbstractStore
from change_set_pb2 import ChangeSet as ChangeSetBuilder
from change_set_info import ChangeSetInfo

def show(file: str):
    """ Prints the contents of a store to stdout. """
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
