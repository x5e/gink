""" Contains the Peer class that manages a connection to another gink instance. """
from typing import Iterable, Optional, Union, Callable
from socket import (
    socket as Socket,
    AF_INET,
    SOCK_STREAM,
)
from logging import getLogger
from abc import ABC, abstractmethod

from .builders import SyncMessage
from .chain_tracker import ChainTracker
from .bundle_info import BundleInfo
from .bundle_wrapper import BundleWrapper


class Connection(ABC):
    """ Manages a connection to another gink database.

        Eventually there will be two subclasses: one to manage websocket connections,
        and another subclass to manage raw socket connections.
    """
    on_ready: Callable

    def __init__(
            self, *,
            host: Optional[str] = None,
            port: Optional[int] = None,
            name: Optional[str] = None,
            socket: Optional[Socket] = None,
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
        self._tracker: Optional[ChainTracker] = None
        self._permissions = 0
        self._name = name

    def get_name(self) -> Optional[str]:
        return self._name

    def get_permissions(self) -> int:
        return self._permissions

    def fileno(self):
        """ Return the file descriptor of the underlying socket.
        """
        return self._socket.fileno()

    def is_closed(self) -> bool:
        """ a way to check if the connection is still active """
        return self._closed

    @abstractmethod
    def receive(self) -> Iterable[SyncMessage]:
        """ receive a (possibly empty) series of encoded SyncMessages from a peer. """

    @abstractmethod
    def send(self, sync_message: SyncMessage):
        """ Send an encoded SyncMessage to a peer. """

    @abstractmethod
    def close(self, reason=None):
        """ End the connection and release resources. """

    def send_bundle(self, bundle_wrapper: BundleWrapper) -> None:
        info = bundle_wrapper.get_info()
        self._logger.debug("(%s) send_bundle %s", self._name, info)
        if self._tracker is None:  # haven't received greeting
            self._logger.debug("_tracker is None")
            return

        if self._tracker.has(info):
            self._logger.debug("(%s) peer already has %s", self._name, info)
            return
        if not self._tracker.is_valid_extension(info):
            raise ValueError("bundle would be an invalid extension!")
        sync_message = SyncMessage()
        sync_message.bundle = bundle_wrapper.get_bytes()
        self.send(sync_message)
        self._tracker.mark_as_having(info)

    def receive_objects(self) -> Iterable[Union[BundleInfo, BundleWrapper, ChainTracker]]:
        for sync_message in self.receive():
            if sync_message.HasField("bundle"):
                bundle_bytes = sync_message.bundle
                wrap = BundleWrapper(bundle_bytes)
                info = wrap.get_info()
                if self._tracker is not None:
                    self._tracker.mark_as_having(info)
                yield wrap
            elif sync_message.HasField("greeting"):
                self._tracker = ChainTracker(sync_message=sync_message)
                yield self._tracker
            elif sync_message.HasField("ack"):
                yield BundleInfo.from_ack(sync_message)
            else:
                self._logger.warning("got binary message without ack, bundle, or greeting")
