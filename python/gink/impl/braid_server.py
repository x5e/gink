from socket import socketpair
from typing import *

from .looping import Selectable
from .database import Database
from .connection import Connection
from .listener import Listener
from .websocket_connection import WebsocketConnection
from .relay import Relay


class BraidServer:

    _connections: Set[Connection]
    _listener: Listener

    def __init__(
            self,
            data_relay: Relay,
            control_db: Database,
            braiding_port: int = 8088,
        ):
        (self._socket_left, self._socket_rite) = socketpair()
        self._connections = set()
        self._indication_sent = False
        self._data_relay = data_relay
        self._control_db = control_db
        self._listener = Listener(WebsocketConnection, port=braiding_port)

    def fileno(self) -> int:
        return self._socket_rite.fileno()

    def on_ready(self) -> Iterable[Selectable]:
        if self._indication_sent:
            self._socket_rite.recv(1)
            self._indication_sent = False
        yield self._listener
        for connection in self._connections:
            yield connection
        yield self._data_relay
        yield self._control_db

    def _indicate_selectables_changed(self):
        if not self._indication_sent:
            self._socket_left.send(b'0x01')
            self._indication_sent = True

    def close(self):
        self._left.close()
        self._rite.close()
        self._listener.close()
        for connection in self._connections:
            connection.close()
