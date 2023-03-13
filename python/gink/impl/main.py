#!/usr/bin/env python3
""" command line tool to view/maniplulate stores """
import sys

from .builders import BundleBuilder
from .bundle_info import BundleInfo

from log_backed_store import LogBackedStore
from lmdb_store import LmdbStore
from abstract_store import AbstractStore


def show(file: str):
    """ Prints the contents of a store to stdout. """
    store: AbstractStore
    builder = BundleBuilder()
    if file.endswith(".gink.mdb"):
        store = LmdbStore(file)
    else:
        store = LogBackedStore(file)

    def dump(data: bytes, info: BundleInfo):
        builder.ParseFromString(data)  # type: ignore
        print("=" * 40)
        print(info)
        print(builder)

    store.get_bundles(dump)
    store.close()


if __name__ == "__main__":
    func = sys.argv[1]
    args = sys.argv[2:]
    globals()[func](*args)
