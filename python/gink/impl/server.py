from typing import Union, Set, Iterable
from logging import getLogger
from socket import socketpair
from abc import ABC, abstractmethod

from .listener import Listener
from .looping import Selectable


class Server(ABC):

    def __init__(self) -> None:
        self._logger = getLogger(self.__class__.__name__)
        (self._socket_left, self._socket_rite) = socketpair()
        self._listeners: Set[Listener] = set()
        self._indication_sent = False
        self._selectables: Set[Selectable] = set()

    def fileno(self) -> int:
        return self._socket_rite.fileno()

    def _add_selectable(self, selectable: Selectable):
        self._selectables.add(selectable)
        if not self._indication_sent:
            self._socket_left.send(b'0x01')
            self._indication_sent = True

    def _remove_selectable(self, selectable: Selectable):
        self._selectables.discard(selectable)

    def on_ready(self) -> Iterable[Selectable]:
        if self._indication_sent:
            self._socket_rite.recv(1)
            self._indication_sent = False
        for selectable in list(self._selectables):
            yield selectable

    def close(self):
        self._socket_left.close()
        self._socket_rite.close()
        for listener in self._listeners:
            listener.close()

    def start_listening(self, ip_addr="", port: Union[str, int] = "8080"):
        """ Listen for incoming connections on the given port.
        """
        port = int(port)
        self._logger.info("starting to listen on %r:%r", ip_addr, port)
        listener = Listener(ip_addr=ip_addr, port=port)
        listener.on_ready = lambda: self._on_listener_ready(listener)
        self._listeners.add(listener)
        self._add_selectable(listener)

    @abstractmethod
    def _on_listener_ready(self, listener: Listener) -> Iterable[Selectable]:
        """ Abstract method called whenever someone attempts to connect to server. """
