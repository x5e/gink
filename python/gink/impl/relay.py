""" Contains the Relay class  """
# standard python modules
from typing import Set, Union, Iterable, List, Callable, Optional, cast
from logging import getLogger
from re import fullmatch, IGNORECASE
from ssl import SSLError
from pathlib import Path

# gink modules
from .bundle_info import BundleInfo
from .connection import Connection
from .listener import Listener
from .has_map import HasMap
from .lmdb_store import LmdbStore
from .memory_store import MemoryStore
from .decomposition import Decomposition
from .looping import Selectable, Finished
from .bundle_store import BundleStore
from .server import Server
from .sync_func import SyncFunc
from .builders import SyncMessage
from .utilities import validate_bundle
from .log_backed_store import LogBackedStore

class Relay(Server):
    """ An extension of the Server class that handles
        creating connections and receiving bundles .
    """

    _store: BundleStore
    _not_acked: Set[BundleInfo]

    def __init__(self, store: Union[BundleStore, str, Path, None] = None):
        super().__init__()
        if isinstance(store, type(None)):
            store = MemoryStore()
        elif isinstance(store, (str, Path)):
            store = Path(store)
            if not store.exists() or LogBackedStore.is_binlog_file(store):
                store = LogBackedStore(store)
            else:
                store = LmdbStore(store)
        assert isinstance(store, BundleStore)
        self._store = store
        self._logger = getLogger(self.__class__.__name__)
        self._callbacks: List[Callable[[Decomposition], None]] = list()
        self._connections: Set[Connection] = set()
        self._not_acked = set()
        if self._store.is_selectable():
            self._store.on_ready = self._on_store_ready
            self._add_selectable(self._store)

    def add_callback(self, callback: Callable[[Decomposition], None]):
        """ Add a callback to be called when a bundle is received. """
        self._callbacks.append(callback)

    def get_store(self) -> BundleStore:
        """ Returns the store managed by this database """
        return self._store

    def get_connections(self) -> Iterable[Connection]:
        """ Returns an iterable of all active connections. """
        for connection in self._connections:
            yield connection

    def connect_to(self, target: str,
                   auth_data: Optional[str] = None,
                   name: Optional[str] = None,
                   ):
        """ Initiate a connection to another Gink instance. """
        self._logger.info("initating connection to %s", target)
        match = fullmatch(r"(ws+://)?([a-z0-9.-]+)(?::(\d+))?(?:/+(.*))?$", target, IGNORECASE)
        assert match, f"can't connect to: {target}"
        prefix, host, port, path = match.groups()
        secure_connection = False
        if prefix == "wss://":
            secure_connection = True
        elif prefix and prefix != "ws://":
            raise NotImplementedError("only vanilla and secure websockets currently supported")

        port = port or "8080"
        path = path or "/"
        connection = Connection(
            host=host,
            port=int(port),
            path=path,
            name=name,
            sync_func=cast(SyncFunc, self._sync_func),
            auth_data=auth_data,
            secure_connection=secure_connection,
            on_ws_act=self._on_connection_ready,
        )
        self._connections.add(connection)
        self._logger.debug("connection added")
        self._add_selectable(connection)

    def _on_store_ready(self):
        """ Called when the store is detects a new bundle. """
        self._store.refresh(self._on_bundle)

    def close(self):
        """ Close the store and the underlying server. """
        self._store.close()
        super().close()

    def _on_bundle(self, bundle_wrapper: Decomposition) -> None:
        """ Sends a bundle either created locally or received from a peer to other peers.

            Should only be called when a bundle has been successfully added to the local store.
        """
        self._logger.debug("_on_bundle for %s", bundle_wrapper.get_info())
        for peer in self._connections:
            peer.send_bundle(bundle_wrapper)
        for callback in self._callbacks:
            callback(bundle_wrapper)

    def receive(self, bundle_wrapper: Decomposition) -> bool:
        """ Receive a bundle, either created locally or from a peer.

            Returns true if the bundle is novel.
        """
        validate_bundle(bundle_wrapper.get_builder())
        return self._store.apply_bundle(bundle_wrapper, self._on_bundle)

    def _on_connection_ready(self, connection: Connection) -> None:
        """ When a connection is ready, receive objects from it.
            Receives a BundleWrapper (data), HasMap (greeting),
            or BundleInfo (ack).

            If the connection is finished, remove it from this
            relay's selectables and list of connections.

        """
        if connection in self._connections:
            try:
                for thing in connection.receive_objects():
                    if isinstance(thing, Decomposition):  # some data
                        self.receive(thing)
                        connection.send(thing.get_info().as_acknowledgement())
                    elif isinstance(thing, HasMap):  # greeting message
                        self._store.get_bundles(connection.send_bundle, peer_has=thing)
                    elif isinstance(thing, BundleInfo):  # an ack:
                        if thing not in self._not_acked:
                            # self._logger.warning(f"ack {thing} not in not_acked")
                            pass # TODO: properly track not acked bundles
                        self._not_acked.discard(thing)
                    else:
                        raise AssertionError(f"unexpected object {thing}")
            except Finished:
                self._connections.remove(connection)
                self._remove_selectable(connection)
                self._logger.info(f"Connection (fileno {connection.fileno()}) disconnected.")
                raise

    def _sync_func(self, **_) -> SyncMessage:
        """ Returns the greeting (SyncMessage) for the underlying store's chain tracker. """
        return self._store.get_has_map().to_greeting_message()

    def _on_listener_ready(self, listener: Listener) -> Iterable[Selectable]:
        """ Called when a listener is ready to accept a connection.
            If the listener is configured to use SSL, attempt to wrap the
            new socket in an SSL context, rejecting the connection upon failure.
        """
        (socket, addr) = listener.accept()
        context = listener.get_context()
        if context:
            try:
                socket = context.wrap_socket(socket, server_side=True)
            except SSLError as e:
                if e.reason == "HTTP_REQUEST":
                    self._logger.warning("Secure server rejecting insecure HTTP request.")
                    return []
                elif e.reason ==  "TLSV1_ALERT_UNKNOWN_CA":
                    self._logger.warning("Connection failed due to client with unknown CA.")
                    return []
                else:
                    raise e

        connection = Connection(
            socket=socket,
            host=addr[0],
            port=addr[1],
            sync_func=cast(SyncFunc, self._sync_func),
            auth_func=listener.get_auth(),
            on_ws_act=self._on_connection_ready,
        )
        self._connections.add(connection)
        self._add_selectable(connection)
        self._logger.info("accepted incoming connection from %s", addr)
        return [connection]
