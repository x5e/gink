from pathlib import Path
from typing import *
from logging import getLogger

from .database import Database
from .listener import Listener
from .connection import Connection, SyncMessage
from .relay import Relay
from .typedefs import AuthFunc, AUTH_MAKE, AUTH_RITE, AUTH_READ, inf
from .server import Server
from .looping import Selectable
from .braid import Braid
from .directory import Directory
from .box import Box
from .looping import Finished
from .bundle_wrapper import BundleWrapper
from .chain_tracker import ChainTracker
from .bundle_info import BundleInfo


class BraidServer(Server):

    def __init__(
            self, *,
            data_relay: Relay,
            control_db: Database,
            auth_func: Optional[AuthFunc] = None,
    ):
        super().__init__()
        self._connections: Set[Connection] = set()
        self._braids: Dict[Connection, Braid] = dict()
        data_relay.add_callback(self._after_relay_recieves_bundle)
        self._data_relay = data_relay
        self._control_db = control_db
        self._auth_func = auth_func
        self._logger = getLogger(self.__class__.__name__)

    def _after_relay_recieves_bundle(self, bundle_wrapper: BundleWrapper) -> None:
        info = bundle_wrapper.get_info()
        chain = info.get_chain()
        # TODO: do something more efficient than looping over connections
        for connection, braid in self._braids.items():
            self._logger.debug("considering connection: %s", connection.get_name())
            if braid.get(chain, default=0) > info.timestamp:
                # Note: connection internally keeps track of what peer has and will prevent echo
                connection.send_bundle(bundle_wrapper)

    def _get_braid(self, path: Path, create_if_missing: bool) -> Braid:
        parts = path.parts
        if len(parts) == 0 or parts[0] == "/":
            raise ValueError(f"invaid path: {path}")
        directory_keys = list(parts[:-1])
        directory_keys.insert(0, 'braids')
        braid_key = parts[-1]
        box = Box(arche=True, database=self._control_db)
        if box.is_empty():
            if create_if_missing:
                box.set(Directory(database=self._control_db))
            else:
                raise ValueError("app directory not configured!")
        current = box.get()
        assert isinstance(current, Directory)
        for key in directory_keys:
            if create_if_missing and key not in current:
                self._logger.debug("creating intermediate directory for %s", key)
                current[key] = Directory(database=self._control_db)
            current = current.get(key)
            if not isinstance(current, Directory):
                raise ValueError(f"could not traverse: {key}")
        if create_if_missing and braid_key not in current:
            self._logger.debug("creating braid for %s", braid_key)
            current[braid_key] = Braid(database=self._control_db)
        braid = current[braid_key]
        if not isinstance(braid, Braid):
            raise ValueError("not a braid")
        return braid

    def get_greeting(self, path: Path, perms: int, misc: Any) -> SyncMessage:
        braid = self._get_braid(path=path, create_if_missing=bool(perms & AUTH_MAKE))
        assert isinstance(misc, Connection)
        self._braids[misc] = braid
        ct = self._data_relay.get_store().get_chain_tracker(limit_to=dict(braid.items()))
        return ct.to_greeting_message()

    def _on_listener_ready(self, listener: Listener) -> Iterable[Selectable]:
        (socket, addr) = listener.accept()
        connection: Connection = Connection(
            socket=socket,
            host=addr[0],
            port=addr[1],
            sync_func=self.get_greeting,
            auth_func=listener.get_auth(),
            name="accepted #%s" % (len(self._connections) + 1,)
        )
        connection.on_ready = lambda: self._on_connection_ready(connection)
        self._connections.add(connection)
        self._add_selectable(connection)
        self._logger.info("accepted incoming connection from %s", addr)
        return [connection]

    def _on_connection_ready(self, connection: Connection):
        braid = None
        try:
            for thing in connection.receive_objects():
                braid = braid or self._braids.get(connection)
                if isinstance(thing, BundleWrapper):  # some data
                    if not connection.get_permissions() & AUTH_RITE:
                        self._logger.debug("ignoring bundle from connection without write perms")
                        continue
                    if braid is None:
                        raise ValueError("don't have braid for this connection")
                    info = thing.get_info()
                    chain = info.get_chain()
                    if chain not in braid:
                        if info.timestamp != info.chain_start:
                            self._logger.warning("connection tried pushing non-start to a braid")
                            raise Finished()
                        braid.set(chain, inf)
                    self._data_relay.receive(thing)
                    connection.send(thing.get_info().as_acknowledgement())
                elif isinstance(thing, ChainTracker):  # greeting message
                    if not connection.get_permissions() & AUTH_READ:
                        self._logger.debug("ignoring greeting from connection without read perms")
                        continue
                    if braid is None:
                        raise ValueError("don't have braid for this connection")
                    self._data_relay.get_store().get_bundles(
                        connection.send_bundle, peer_has=thing, limit_to=dict(braid.items()))
                elif isinstance(thing, BundleInfo):  # an ack:
                    pass
                else:
                    raise AssertionError(f"unexpected object {thing}")
        except Finished:
            self._connections.remove(connection)
            self._remove_selectable(connection)
            raise
