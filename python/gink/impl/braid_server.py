from socket import socketpair
from typing import *

from .looping import Selectable, loop
from .database import Database
from .connection import Connection
from .listener import Listener
from .websocket_connection import WebsocketConnection


class BraidServer:

    _connections: Set[Connection]
    _listener: Listener

    def __init__(
            self,
            data_database: Database,
            meta_database: Database,
            braiding_port: int = 8888,
        ):
        (self._socket_left, self._socket_rite) = socketpair()
        self._connections = set()
        self._indication_sent = False
        self._data_database = data_database
        self._meta_database = meta_database
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
        yield self._data_database
        yield self._meta_database

    def _indicate_selectables_changed(self):
        if not self._indication_sent:
            self._socket_left.send(b'0x01')
            self._indication_sent = True

if __name__ == "__main__":
    loop(BraidServer())
