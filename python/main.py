#!/usr/bin/env python3
import sys
from sync_message_pb2 import SyncMessage as SyncMessageBuilder
from log_file_pb2 import LogFile as LogFileBuilder
from change_set_pb2 import ChangeSet

with open(sys.argv[1], "rb") as handle:
    logFileBuilder = LogFileBuilder()
    logFileBuilder.ParseFromString(handle.read())  # type: ignore
    print(logFileBuilder)
    for commit in logFileBuilder.commits: # type: ignore
        changeSet = ChangeSet()
        changeSet.ParseFromString(commit)
        print(changeSet)
