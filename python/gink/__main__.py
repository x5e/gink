#!/usr/bin/env python3
""" command line interface for Gink """
import sys
import os
import copy
import code
import logging
import readline
from . import LmdbStore, LogBackedStore, Directory, Database, Sequence, AbstractStore

assert readline
logging.basicConfig(level=os.environ.get("GINK_LOG_LEVEL", "INFO"))
gink_file = os.environ.get("GINK_FILE", "/tmp/gink.mdb")
store: AbstractStore
if gink_file.endswith(".mdb"):
    store = LmdbStore(gink_file)
elif gink_file.endswith(".binaryproto"):
    store = LogBackedStore(gink_file)
else:
    raise SystemExit(f"don't know file type of: {gink_file}")
database = Database(store)
root = Directory.get_global_instance(database=database)
queue = Sequence.get_global_instance(database=database)
args = copy.copy(sys.argv)
args.pop(0)  # remove script

cmd = args.pop(0) if args else None
if cmd == "demo":
    pass
elif cmd == "blame":
    root.show_blame()
elif cmd == "get":
    if not args:
        raise SystemExit("Key not specified.")
    gotten = root.get(args[0])
    if gotten:
        print(gotten)
    else:
        raise SystemExit("No entry under that key.")
elif cmd == "set":
    if not args:
        raise SystemExit("Key not specified.")
    root[args[0]] = sys.stdin.read().rstrip()
elif cmd == "shell":
    code.InteractiveConsole(globals()).interact()
elif cmd in ("run", "serve"):
    if cmd == "serve":
        os.environ.setdefault("GINK_PORT", "8080")
    port = os.environ.get("GINK_PORT")
    if port:
        database.start_listening(port=port)
    for arg in args:
        database.connect_to(arg)
    database.run()
elif cmd == "dump":
    database.dump()
elif cmd in ("help", "--help", "-h"):
    print("""
    Show this help text:
        python3 -m gink help

    The remaining commands operate on a gink database file, which defaults
    to using /tmp/gink.mdb but can be set with GINK_FILE environment variable.

    Set key "foo" to value "bar" in the root directory:
        python3 -m gink set foo <<< 'bar'

    Get the value stored at key "foo" in the root directory:
        python3 -m gink get foo

    Dump the contents of the database in a human friendly format:
        python3 -m gink dump

    Connect to a remotely running peers (port defaults to 8080):
        python3 -m gink run 192.168.1.1 example.com:8081

    Listen on port 8080 for incomming connections:
        GINK_PORT=8080 python3 -m gink run

    The command 'serve' is an alias to run plus ensure that GINK_PORT is set.
        python3 -m gink serve

    Listen on port 8080 for incomming connections and also connect to example.com:
        python3 -m gink serve example.com
    """, file=sys.stderr)
else:
    raise SystemExit("command not recognized, try --help")
