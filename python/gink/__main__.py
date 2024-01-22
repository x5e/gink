#!/usr/bin/env python3
""" command line interface for Gink """
from logging import basicConfig, getLogger
from sys import exit, stdin, stderr
from re import fullmatch
from argparse import ArgumentParser, Namespace

from . import *
from .impl.builders import BundleBuilder
from .impl.selectable_console import SelectableConsole

parser: ArgumentParser = ArgumentParser(allow_abbrev=False)
parser.add_argument("db_path", help="path to a database; created if doesn't exist")
parser.add_argument("--verbosity", "-v", default="INFO", help="the log level to use, e.g. INFO or DEBUG")
parser.add_argument("--format", default="lmdb", help="storage file format", choices=["lmdb", "binlog"])
parser.add_argument("--set", help="set key/value in directory (default root) reading value from stdin")
parser.add_argument("--get", help="get a value in the database (default root) and print to stdout")
parser.add_argument("--dump", nargs="?", const=True,
                    help="dump contents to stdout and exit (path or muid, or everything if blank)")
parser.add_argument("--blame", action="store_true", help="show blame information")
parser.add_argument("--as_of", help="as-of time to use for dump or get opperation")
parser.add_argument("--mkdir", help="create a directory using path notation")
parser.add_argument("--comment", help="comment to add to modifications (set or mkdir)")
parser.add_argument("--log", nargs="?", const="-10", type=int,
                    help="show LOG entries from log (e.g. last ten entries as LOG=-10)")
parser.add_argument("--listen_on", "-l", nargs="?", const=True,
                    help="start listening on ip:port (default *:8080)")
parser.add_argument("--connect_to", "-c", nargs="+", help="remote instances to connect to")
parser.add_argument("--show_arguments", action="store_true")
parser.add_argument("--show_bundles", action="store_true")
parser.add_argument("--repr", action="store_true", help="show repr of stored value when using --get")
args: Namespace = parser.parse_args()
if args.show_arguments:
    print(args)
    exit(0)
basicConfig(format="\r[%(asctime)s.%(msecs)03d %(name)s:%(levelname)s] %(message)s",
            level=args.verbosity, datefmt='%I:%M:%S')
logger = getLogger()

store: AbstractStore
if args.db_path is None:
    logger.warning("Using a transient in-memory database.")
    store = MemoryStore()
elif args.format == "lmdb":
    store = LmdbStore(args.db_path)
else:
    store = LogBackedStore(args.db_path)

database = Database(store)
root = Directory.get_global_instance(database=database)

if args.dump:
    if args.dump is True:
        database.dump(as_of=args.as_of)
    else:
        dumping: str = args.dump
        if dumping.startswith("/"):
            path_components = args.dump.split("/")
            container = root
            for component in path_components:
                if not component:
                    continue
                container = container.get(component, as_of=args.as_of)
        else:
            muid = Muid.from_str(args.dump)
            container = database.get_container(muid=muid)
        container.dump(as_of=args.as_of)
    exit(0)

if args.show_bundles:
    builder = BundleBuilder()
    def show(data: bytes, _: BundleInfo):
        builder.ParseFromString(data)  # type: ignore
        print("=" * 79)
        print(builder)
    store.get_bundles(show)
    store.close()
    exit(0)

if args.set:
    value = stdin.read().rstrip()
    container = root
    key = args.set
    container.set(key, value, comment=args.comment)
    exit(0)

if args.get:
    container = root
    result = container.get(args.get, as_of=args.as_of)
    print(repr(result))
    exit(0)

if args.blame:
    if args.blame is True:
        root.show_blame(as_of=args.as_of)
    else:
        old_directory = root
        path_components = args.get.split("/")
        for component in path_components:
            old_directory = old_directory.get(component, as_of=args.as_of)
            assert isinstance(old_directory, Directory)
        old_directory.show_blame()
    exit(0)

if args.mkdir:
    path_components = args.mkdir.split("/")
    old_directory = root
    for component in path_components[:-1]:
        if not component: continue
        old_directory = old_directory.get(component, as_of=args.as_of)
        assert isinstance(old_directory, Directory)
    new_directory = Directory.create(database=database)
    old_directory.set(path_components[-1], new_directory, comment=args.comment)
    exit(0)

if args.log:
    database.show_log(args.log)
    exit(0)

if args.listen_on:
    ip_addr = "*"
    port = "8080"
    if args.listen_on is True:
        pass
    elif ":" in args.listen_on:
        ip_addr, port = args.listen_on.split(":")
    elif fullmatch(r"\d+", args.listen_on):
        port = args.listen_on
    else:
        ip_addr = args.listen_on
    if ip_addr == "*":
        ip_addr = ""
    database.start_listening(ip_addr=ip_addr, port=port)

for target in (args.connect_to or []):
    database.connect_to(target)

if stdin.isatty():
    while True:
        try:
            console = SelectableConsole(locals())
            database.run(console=console)
        except EOFError:
            exit(0)
        except KeyboardInterrupt as ke:
            print("\r\nKeyboardInterrupt", end="\r\n", file=stderr)
            stderr.flush()
else:
    database.run()
