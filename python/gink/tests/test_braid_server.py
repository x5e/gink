from .. import *
from ..impl.braid_server import BraidServer, Database
from ..impl.looping import loop

def test_happy_path():
    data_store = LmdbStore()
    ctrl_store = LmdbStore()
    relay = Database(data_store)
    control_db = Database(ctrl_store)
    braid_server = BraidServer(data_relay=relay, control_db=control_db)
    external = Database()
    braid_server.start_listening(port=9999)
    external.connect_to(target="localhost:9999/abc")
    external2 = Database()
    external2.connect_to(target="localhost:9999/abc")
    loop(braid_server, external, external2)
    external_root1 = Directory(database=external, arche=True)
    external_root1["foo"] = "bar"
    loop(braid_server, external)
    control_root = Database(arche=True, database=control_db)
    braid = control_root["abc"]
    assert isinstance(braid, Braid)
    external_root2 = Directory(database=external2, arche=True)
    assert external_root2["foo"] == "bar"
