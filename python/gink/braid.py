from argparse import ArgumentParser, Namespace
from sys import stdin, stderr, exit

from . import *
from .impl.selectable_console import SelectableConsole
from .impl.looping import loop
from .impl.relay import Relay
from .impl.braid_server import BraidServer

parser: ArgumentParser = ArgumentParser(allow_abbrev=False)
parser.add_argument("--braid_store")
parser.add_argument("--admin_store")
args: Namespace = parser.parse_args()

if not (args.braid_store and args.admin_store):
    print("need to specify braid_store and admin_store", file=stderr)
    exit(1)

data_relay = Relay(LmdbStore(args.braid_store, apply_changes=False))
control_db = Database(LmdbStore(args.admin_store))
braid_server = BraidServer(data_relay=data_relay, control_db=control_db)
console = SelectableConsole(locals(), interactive=stdin.isatty())


loop(console, braid_server, context_manager=console)
