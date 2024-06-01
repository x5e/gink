""" contains the Listener class that listens on a port for incomming connections """
from typing import Callable
from socket import (
    socket as Socket,
    AF_INET,
    SOCK_STREAM,
    SOL_SOCKET,
    SO_REUSEADDR,
)


class Listener(Socket):
    """ Listens on a port for incoming connections. """

    on_ready: Callable  # needs to by dynamically assigned

    def __init__(
            self,
            ip_addr: str = "",
            port: int = 8080,
            ):
        self._socket = Socket(AF_INET, SOCK_STREAM)
        self._socket.setsockopt(SOL_SOCKET, SO_REUSEADDR, 1)
        self._socket.bind((ip_addr, int(port)))
        self._socket.listen(128)
