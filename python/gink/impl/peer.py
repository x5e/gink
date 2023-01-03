from typing import Iterable, Optional
from socket import (
    socket as Socket,
    AF_INET,
    SOCK_STREAM,
)
from logging import getLogger
from abc import ABC, abstractmethod

class Peer(ABC):
    """ Manages a connection to another gink database.

        Eventually there will be two subclasses: one to manage websocket connections,
        and another subclass to manage raw socket connections.
    """

    def __init__(self, host: str, port: int, socket: Optional[Socket] = None):
        if socket is None:
            socket = Socket(AF_INET, SOCK_STREAM)
            socket.connect((host, port))
        self._socket = socket
        self._host = host
        self._port = port
        self._logger = getLogger(self.__class__.__name__)

    def fileno(self):
        """ Return the file descriptor of the underlying socket.
        """
        return self._socket.fileno()
    
    @abstractmethod
    def receive(self) -> Iterable[bytes]:
        raise NotImplementedError()

    @abstractmethod
    def send(self, _: bytes):
        raise NotImplementedError()

    def close(self):
        self._socket.shutdown(SHUT_WR)
        self._socket.close()
