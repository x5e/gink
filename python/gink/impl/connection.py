""" Contains the Peer class that manages a connection to another gink instance. """
from typing import Iterable, Optional
from socket import (
    socket as Socket,
    AF_INET,
    SOCK_STREAM,
)
from logging import getLogger
from abc import ABC, abstractmethod

from .builders import SyncMessage


class Connection(ABC):
    """ Manages a connection to another gink database.

        Eventually there will be two subclasses: one to manage websocket connections,
        and another subclass to manage raw socket connections.
    """

    def __init__(
            self,
            host: Optional[str] = None,
            port: Optional[int] = None,
            socket: Optional[Socket] = None
    ):
        if socket is None:
            assert host is not None and port is not None
            socket = Socket(AF_INET, SOCK_STREAM)
            socket.connect((host, port))
        self._socket = socket
        self._host = host
        self._port = port
        self._logger = getLogger(self.__class__.__name__)
        self._closed = False
        self._replied_to_greeting = False

    def fileno(self):
        """ Return the file descriptor of the underlying socket.
        """
        return self._socket.fileno()

    def is_closed(self) -> bool:
        """ a way to check if the connection is still active """
        return self._closed

    def set_replied_to_greeting(self):
        self._replied_to_greeting = True

    def get_replied_to_greeting(self) -> bool:
        return self._replied_to_greeting

    @abstractmethod
    def receive(self) -> Iterable[SyncMessage]:
        """ receive a (possibly empty) series of encoded SyncMessages from a peer. """

    @abstractmethod
    def send(self, sync_message: SyncMessage):
        """ Send an encoded SyncMessage to a peer. """

    @abstractmethod
    def close(self, reason=None):
        """ End the connection and release resources. """
