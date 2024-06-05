from socket import socketpair
from pathlib import Path
from typing import *

from .database import Database
from .connection import Connection
from .listener import Listener
from .websocket_connection import WebsocketConnection, SyncMessage
from .relay import Relay
from .typedefs import AuthFunc, AUTH_MAKE
from .server import Server
from .looping import Selectable
from .braid import Braid
from .directory import Directory

class BraidServer(Server):

    def __init__(
            self, *,
            data_relay: Relay,
            control_db: Database,
            auth_func: Optional[AuthFunc] = None,
        ):
        (self._socket_left, self._socket_rite) = socketpair()
        self._connections: Set[Connection] = set()
        self._braids: Dict[Connection, Braid] = dict()
        self._data_relay = data_relay
        self._control_db = control_db
        self._auth_func = auth_func

    def _get_braid(self, path: Path, create_if_missing: bool) -> Braid:
        parts = path.parts
        if len(parts) < 2 or parts[0] != "/":
            raise ValueError(f"invaid path: {path}")
        directory_keys = parts[1:-1]
        braid_key = parts[-1]
        current = Directory(arche=True, database=self._control_db)
        for key in directory_keys:
            if create_if_missing and key not in current:
                current[key] = Directory()
            current = current[key]
            if not isinstance(current, Directory):
                raise ValueError(f"could not traverse: {key}")
        if create_if_missing and key not in current:
            current[braid_key] = Braid()
        braid = current[braid_key]
        if not isinstance(braid, Braid):
            raise ValueError("not a braid")
        return braid

    def get_greeting(self, path: Path, permissions: int, misc: Any) -> SyncMessage:
        braid = self._get_braid(path=path, create_if_missing=permissions & AUTH_MAKE)
        assert isinstance(misc, Connection)
        self._braids[misc] = braid
        ct = self._data_relay.get_store().get_chain_tracker(limit_to=dict(braid.items()))
        return ct.to_greeting_message()

    def _on_listener_ready(self, listener: Listener) -> Iterable[Selectable]:
        (socket, addr) = listener.accept()
        connection: Connection = WebsocketConnection(
            socket=socket,
            host=addr[0],
            port=addr[1],
            sync_func=self.get_greeting,
            auth_func=listener.get_auth(),
        )
        connection.on_ready = lambda: self._on_connection_ready(connection)
        self._connections.add(connection)
        self._add_selectable(connection)
        self._logger.info("accepted incoming connection from %s", addr)
        return [connection]

    def _on_connection_ready(self, connection: Connection):
        assert connection
        raise NotImplementedError()
