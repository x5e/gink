from socket import socketpair
from pathlib import Path
from typing import *

from .database import Database
from .connection import Connection
from .listener import Listener
from .websocket_connection import WebsocketConnection, SyncMessage
from .relay import Relay
from .typedefs import AuthFunc
from .server import Server
from .looping import Selectable


class BraidServer(Server):

    def __init__(
            self, *,
            data_relay: Relay,
            control_db: Database,
            auth_func: Optional[AuthFunc] = None,
        ):
        (self._socket_left, self._socket_rite) = socketpair()
        self._connections: Set[Connection] = set()
        self._data_relay = data_relay
        self._control_db = control_db
        self._auth_func = auth_func

    def get_greeting(self, path: Path) -> SyncMessage:
        assert path
        raise NotImplementedError()

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
