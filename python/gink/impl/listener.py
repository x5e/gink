""" contains the Listener class that listens on a port for incomming connections """
from typing import Callable, Type
from socket import (
    socket as Socket,
    AF_INET,
    SOCK_STREAM,
    SOL_SOCKET,
    SO_REUSEADDR,
)

from .builders import SyncMessage

from .connection import Connection
from .websocket_connection import WebsocketConnection


class Listener:
    """ Listens on a port for incoming connections. """

    on_ready: Callable  # needs to by dynamically assigned

    def __init__(self, connection_class: Type[Connection]=WebsocketConnection, ip_addr: str = "", port: int = 8080):
        self._connection_class = connection_class
        self._socket = Socket(AF_INET, SOCK_STREAM)
        self._socket.setsockopt(SOL_SOCKET, SO_REUSEADDR, 1)
        self._socket.bind((ip_addr, int(port)))
        self._socket.listen(128)

    def fileno(self):
        """ Gives the file descriptor for use in socket.select and similar. """
        return self._socket.fileno()

    def close(self):
        self._socket.close()

    def accept(self, greeting: SyncMessage) -> Connection:
        """ Method to call when the underlying socket is "ready". """
        (new_socket, addr) = self._socket.accept()
        peer: Connection = self._connection_class(
            socket=new_socket,
            host=addr[0],
            port=addr[1],
            greeting=greeting)
        return peer
