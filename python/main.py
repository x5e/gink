#!/usr/bin/env python3
import sys
import lmdb
from sync_message_pb2 import SyncMessage
from log_file_pb2 import LogFile
from change_set_pb2 import ChangeSet

def read_log_file(fn):
    with open(fn, "rb") as handle:
        logFileBuilder = LogFile()
        logFileBuilder.ParseFromString(handle.read())
        print(logFileBuilder)
        for commit in logFileBuilder.commits:
            changeSet = ChangeSet()
            changeSet.ParseFromString(commit)
            print(changeSet)

class GinkDatabase(object):
    def __init__(self, fn):
        self.fn = fn
        self.env = lmdb.open(fn, max_dbs=2, subdir=False)
    
    def close(self):
        self.env.close()

    def add_commit(self, commit: bytes):
        changeSet = ChangeSet()
        changeSet.ParseFromString(commit)
        medallion = changeSet.medallion
        timestamp = changeSet.timestamp
        chain_start = changeSet.chain_start
        if not (isinstance(medallion, int) and medallion > 0):
            raise ValueError(f'medallion({medallion}) is invalid')
        if not (isinstance(timestamp, int) and timestamp > 0):
            raise ValueError(f'timestamp({timestamp}) is invalid')
        if not (isinstance(chain_start, int) and chain_start > 0 and chain_start <= timestamp):
            raise ValueError(f'chain_start({chain_start}) is invalid')

        


gdb = GinkDatabase('/tmp/gink/python')
