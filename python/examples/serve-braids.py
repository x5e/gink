""" Example of running a braid server.
    Does not sync the admin or braid stores to other machines, only serves braids from this instance.
    Currently doesn't include any auth.
"""

from argparse import ArgumentParser, Namespace
from sys import stdin
from pathlib import Path

from gink import SelectableConsole, Database, LmdbStore, BraidServer, Relay, loop

parser: ArgumentParser = ArgumentParser(allow_abbrev=False)
parser.add_argument("--braid-store", help="where to store user data", required=True)
parser.add_argument("--admin-store", help="where to store metadata", required=True)
parser.add_argument("--static-path", help="optional location to serve static files from", type=Path)
parser.add_argument("--braid-port", type=int, required=True)
parser.add_argument("--app-id", help="application id")
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
