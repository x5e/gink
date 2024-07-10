#!/usr/bin/env python3
""" command line interface for Gink """
from logging import basicConfig, getLogger
from sys import exit, stdin, stderr, stdout
from re import fullmatch
from argparse import ArgumentParser, Namespace
from pathlib import Path
from typing import Optional, Tuple, Union
from importlib import import_module
from os import environ
from json import dumps

from . import *
from .impl.builders import BundleBuilder
from .impl.selectable_console import SelectableConsole
from .impl.utilities import get_identity, make_auth_func
from .impl.looping import loop
from .impl.wsgi_listener import WsgiListener

parser: ArgumentParser = ArgumentParser(allow_abbrev=False)
parser.add_argument("db_path", nargs="?", help="path to a database; created if doesn't exist")
parser.add_argument("--verbosity", "-v", default="INFO", help="the log level to use, e.g. INFO or DEBUG")
parser.add_argument("--format", default="lmdb", help="storage file format", choices=["lmdb", "binlog"])
parser.add_argument("--set", help="set key/value in path from root, reading value from stdin")
parser.add_argument("--get", help="get a value from specified path and write to stdout")
parser.add_argument("--delete", help="delete the value at the specified key or path")
parser.add_argument("--dump", nargs="?", const=True,
                    help="dump contents to stdout and exit (path or muid, or everything if blank)")
parser.add_argument("--blame", action="store_true", help="show blame information")
parser.add_argument("--as_of", help="as-of time to use for dump or get operation")
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
parser.add_argument("--line_mode", action="store_true", help="read lines of input from stdin")
parser.add_argument("--interactive", action="store_true", help="force interactive mode")
parser.add_argument("--heartbeat_to", type=Path, help="write on console refresh (for debugging)")
parser.add_argument("--identity", help="explicitly set identity to be associated with changes")
parser.add_argument("--starts", help="include starting bundles when showing log", action="store_true")
parser.add_argument("--wsgi", help="serve module.function via wsgi")
parser.add_argument("--wsgi_listen_on", help="ip:port or port to listen on (defaults to *:8081)")
parser.add_argument("--auth_token", default=environ.get("GINK_AUTH_TOKEN"), help="auth token for connections")
parser.add_argument("--ssl-cert", default=environ.get("GINK_SSL_CERT"), help="path to ssl certificate file")
parser.add_argument("--ssl-key", default=environ.get("GINK_SSL_KEY"), help="path to ssl key file")
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

database = Database(store, identity=args.identity or get_identity())
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
    database.close()
    exit(0)

if args.set:
    value = stdin.buffer.read()
    container = root
    container.set(args.set.split("/"), value, comment=args.comment)
    database.close()
    exit(0)

if args.get:
    container = root
    default = object()
    result = container.get(args.get.split("/"), default, as_of=args.as_of)
    if result is default:
        print("nothing found", file=stderr)
        exit(1)
    if isinstance(result, (dict, list, tuple)):
        result = dumps(result)
    if isinstance(result, str):
        result = result.encode()
    stdout.buffer.write(result)
    stdout.buffer.flush()
    database.close()
    exit(0)

if args.delete:
    root.delete(args.delete.split("/"), comment=args.comment)
    database.close()
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
    database.close()
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
    database.close()
    exit(0)

if args.log:
    database.show_log(args.log, include_starts=args.starts)
    database.close()
    exit(0)

def parse_listen_on(
        listen_on: Union[str, None, bool],
        ip_addr = "*",
        port = "8080") -> Tuple[str, str]:
    if listen_on is True or listen_on is None:
        pass
    elif ":" in listen_on:
        ip_addr, port = listen_on.split(":")
    elif fullmatch(r"\d+", listen_on):
        port = listen_on
    else:
        ip_addr = listen_on
    if ip_addr == "*":
        ip_addr = ""
    return (ip_addr, port)

wsgi_listener: Optional[WsgiListener] = None
if args.wsgi:
    match = fullmatch(r"([\w.]+)\.(\w+)", args.wsgi)
    if not match:
        raise ValueError(f"need to specify module.function, got '{args.wsgi}'")
    module, function = match.groups()
    imported = import_module(module)
    app = getattr(imported, function, None)
    if not app:
        raise ValueError(f"{function} not found in {module}")
    ip_addr, port = parse_listen_on(args.wsgi_listen_on, "*", "8081")
    # Note: this should always be called after a database is initialized
    # to prevent Database.get_last() from breaking.
    wsgi_listener = WsgiListener(app, ip_addr=ip_addr, port=int(port))

auth_func = make_auth_func(args.auth_token) if args.auth_token else None

if args.listen_on:
    ip_addr, port = parse_listen_on(args.listen_on, "*", "8080")
    database.start_listening(
        addr=ip_addr,
        port=port,
        auth=auth_func,
        certfile=args.ssl_cert,
        keyfile=args.ssl_key)

for target in (args.connect_to or []):
    auth_data = f"Token {args.auth_token}" if args.auth_token else None
    database.connect_to(target, auth_data=auth_data)

if args.interactive:
    interactive = True
elif args.line_mode:
    interactive = False
else:
    interactive = stdin.isatty()

console = SelectableConsole(locals(), interactive=interactive, heartbeat_to=args.heartbeat_to)

loop(console, database, wsgi_listener, context_manager=console)
