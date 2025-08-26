from .. import *
from ..impl.looping import loop
from logging import getLogger

def test_happy_path():
    logger = getLogger(__name__)
    data_store = LmdbStore()
    ctrl_store = LmdbStore()
    relay = Relay(data_store)
    control_db = Database(ctrl_store)
    test_braid = Braid(database=control_db)
    braid_func = lambda _: test_braid
    braid_server = BraidServer(data_relay=relay, braid_func=braid_func)
    external1 = Database()
    braid_server.start_listening(port=9999)
    external1.connect_to(target="localhost:9999/abc/xyz", name="external1")
    external2 = Database()
    external2.connect_to(target="localhost:9999/abc/xyz", name="external2")
    loop(braid_server, external1, external2, until=0.1)
    assert list(external1.get_connections())
    assert list(external2.get_connections())

    logger.debug("connections established")
    external_root1 = Directory(database=external1, root=True)
    external_root1["foo"] = "bar"
    loop(braid_server, external1, external2, until=0.1)

    external_root2 = Directory(database=external2, root=True)
    assert external_root2["foo"] == "bar"
