""" Contains the Peer class that manages a connection to another gink instance. """
from typing import Iterable, Optional
from socket import (
    socket as Socket,
    AF_INET,
    SOCK_STREAM,
    SHUT_WR,
    SHUT_RD,
)
from logging import getLogger
from abc import ABC, abstractmethod

class Peer(ABC):
    """ Manages a connection to another gink database.

        Eventually there will be two subclasses: one to manage websocket connections,
        and another subclass to manage raw socket connections.
    """

    def __init__(
        self,
        host: Optional[str]=None,
        port: Optional[int]=None,
        socket: Optional[Socket] = None):
        if socket is None:
            assert host is not None and port is not None
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
        """ receive a (possibly empty) series of encoded SyncMessages from a peer. """
        raise NotImplementedError()

    @abstractmethod
    def send(self, _: bytes):
        """ Send an encoded SyncMessage to a peer. """
        raise NotImplementedError()

    def close(self, reason=None):
        """ End the connection and release resources. """
        if reason is not None:
            raise NotImplementedError()
        self._socket.shutdown(SHUT_WR | SHUT_RD)
        self._socket.close()
