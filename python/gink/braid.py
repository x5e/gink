from argparse import ArgumentParser, Namespace
from sys import stdin, stderr, exit
from pathlib import Path

from . import *
from .impl.selectable_console import SelectableConsole
from .impl.looping import loop
from .impl.relay import Relay
from .impl.braid_server import BraidServer

parser: ArgumentParser = ArgumentParser(allow_abbrev=False)
parser.add_argument("--braid_store")
parser.add_argument("--admin_store")
parser.add_argument("--static_path", help="optional location to serve static files from", type=Path)
parser.add_argument("--braid_port", type=int)
args: Namespace = parser.parse_args()

if not (args.braid_store and args.admin_store):
    print("need to specify braid_store and admin_store", file=stderr)
    exit(1)

data_relay = Relay(LmdbStore(args.braid_store, apply_changes=False))
control_db = Database(LmdbStore(args.admin_store))
braid_server = BraidServer(
    data_relay=data_relay,
    control_db=control_db,
    static_root=args.static_path,
)
if args.braid_port:
    braid_server.start_listening(port=args.braid_port)
console = SelectableConsole(locals(), interactive=stdin.isatty())


loop(console, braid_server, context_manager=console)
