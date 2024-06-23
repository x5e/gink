from typing import Union, Set, Iterable, Optional
from logging import getLogger
from socket import socketpair
from abc import ABC, abstractmethod

from .listener import Listener
from .looping import Selectable
from .typedefs import AuthFunc


class Server(ABC):

    def __init__(self) -> None:
        self._logger = getLogger(self.__class__.__name__)
        (self._socket_left, self._socket_rite) = socketpair()
        self._listeners: Set[Listener] = set()
        self._indication_sent = False
        self._selectables: Set[Selectable] = set()

    def get_selectables(self)-> Iterable[Selectable]:
        for selectable in self._selectables:
            yield selectable

    def fileno(self) -> int:
        return self._socket_rite.fileno()

    def _add_selectable(self, selectable: Selectable):
        self._selectables.add(selectable)
        self._socket_left.send(b'1')

    def _remove_selectable(self, selectable: Selectable):
        self._selectables.discard(selectable)

    def on_ready(self) -> Iterable[Selectable]:
        self._socket_rite.recv(1)
        return self.get_selectables()

    def close(self):
        self._socket_left.close()
        self._socket_rite.close()
        for listener in self._listeners:
            listener.close()

    def start_listening(self, addr="",
                        port: Union[str, int] = "8080",
                        auth: Optional[AuthFunc] = None,
                        certfile: Optional[str] = None,
                        keyfile: Optional[str] = None,
                        ):

        """ Listen for incoming connections on the given port.
        """
        port = int(port)
        listener = Listener(addr=addr, port=port, auth=auth, certfile=certfile, keyfile=keyfile)
        security = "insecure"
        if listener.get_context():
            security = "secure"
        self._logger.info(f"starting {security} server listening on %r:%r", addr, port)

        listener.on_ready = lambda: self._on_listener_ready(listener)
        self._listeners.add(listener)
        self._add_selectable(listener)

    @abstractmethod
    def _on_listener_ready(self, listener: Listener) -> Iterable[Selectable]:
        """ Abstract method called whenever someone attempts to connect to server. """
