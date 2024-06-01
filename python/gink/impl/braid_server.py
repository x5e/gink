from socket import socketpair
from typing import *

from .database import Database
from .connection import Connection
from .listener import Listener
from .websocket_connection import WebsocketConnection
from .relay import Relay
from .typedefs import AuthFunc
from .server import Server
from .looping import Selectable


class BraidServer(Server):

    _connections: Set[Connection]
    _listener: Listener

    def __init__(
            self, *,
            data_relay: Relay,
            control_db: Database,
            braiding_port: int = 8088,
        ):
        (self._socket_left, self._socket_rite) = socketpair()
        self._connections = set()
        self._data_relay = data_relay
        self._control_db = control_db
        self._listener = Listener(port=braiding_port)

    def _on_listener_ready(self, listener: Listener) -> Iterable[Selectable]:
        """ Abstract method called whenever someone attempts to connect to server. """
        assert listener
        return []
