from argparse import ArgumentParser, Namespace
from sys import stdin, stderr, exit
from pathlib import Path

from . import *
from .impl.selectable_console import SelectableConsole
from .impl.looping import loop
from .impl.relay import Relay
from .impl.braid_server import BraidServer

parser: ArgumentParser = ArgumentParser(allow_abbrev=False)
parser.add_argument("--braid_store", help="where to store user data", required=True)
parser.add_argument("--admin_store", help="where to store metadata", required=True)
parser.add_argument("--static_path", help="optional location to serve static files from", type=Path)
parser.add_argument("--braid_port", type=int, required=True)
parser.add_argument("--app_id", help="application id from identity provider")
args: Namespace = parser.parse_args()

data_relay = Relay(LmdbStore(args.braid_store, apply_changes=False))
control_db = Database(LmdbStore(args.admin_store))
braid_server = BraidServer(
    data_relay=data_relay,
    control_db=control_db,
    static_root=args.static_path,
    app_id=args.app_id,
)
braid_server.start_listening(port=args.braid_port)
console = SelectableConsole(locals(), interactive=stdin.isatty())

loop(console, braid_server, context_manager=console)
