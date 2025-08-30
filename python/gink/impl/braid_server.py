from typing import *
from logging import getLogger
from ssl import SSLError
from typing_extensions import override
from collections import defaultdict

from .builders import SyncMessage
from .listener import Listener
from .connection import Connection
from .relay import Relay
from .typedefs import Request, inf, AUTH_READ, AUTH_RITE, AuthFunc
from .server import Server
from .looping import Selectable
from .braid import Braid
from .looping import Finished
from .decomposition import Decomposition
from .has_map import HasMap
from .bundle_info import BundleInfo
from .utilities import experimental
from .tuples import Chain

@experimental
class BraidServer(Server):

    EMPTY: Tuple = tuple()

    def __init__(
            self, *,
            data_relay: Relay,
            braid_func: Callable[[Request], Braid],
            auth_func: Optional[AuthFunc] = None,
            wsgi_func: Optional[Callable] = None,
    ):
        super().__init__()
        self._connection_braid_map: Dict[Connection, Braid] = dict()
        self._braid_connection_map: Dict[Braid, Set[Connection]] = defaultdict(lambda: set())
        data_relay.add_callback(self._after_relay_recieves_bundle)
        self._data_relay = data_relay
        self._logger = getLogger(self.__class__.__name__)
        self._count_connections = 0
        self._wsgi_func = wsgi_func
        self._auth_func = auth_func
        self._braid_func = braid_func
        self._chain_connections_map: Dict[Chain, Set[Connection]] = defaultdict(lambda: set())
        """


            Note that the braid returned by the braid_func should not be modified once returned except by this
            braid server, otherwise, the braid server won't know about chains that have been added and won't
            send the appropriate updates to it.
        """

    def _get_connections(self) -> Iterable[Connection]:
        """ Returns an iterable of active selectable Connection objects. """
        for selectable in self.get_selectables():
            if isinstance(selectable, Connection):
                yield selectable

    def _after_relay_recieves_bundle(self, decomposition: Decomposition) -> None:
        """ Internal callback that distributes a bundle to all connections when
            the relay receives a bundle.
        """
        info = decomposition.get_info()
        self._logger.debug("received bundle: %s", info)
        chain = info.get_chain()
        for connection in self._chain_connections_map.get(chain, self.EMPTY):
            braid = self._connection_braid_map[connection]
            self._logger.debug("considering connection: %s", connection.name)
            if braid.get(chain, 0) > info.timestamp:
                # Note: connection internally keeps track of what peer has and will prevent echo
                connection.send_bundle(decomposition)

    def _get_greeting(self, connection: Connection) -> SyncMessage:
        braid = self._braid_func(connection)
        if not isinstance(braid, Braid):
            raise ValueError("braid should be a Braid instance")
        self._connection_braid_map[connection] = braid
        self._braid_connection_map[braid].add(connection)
        for chain, _ in braid.items():
            self._chain_connections_map[chain].add(connection)
        has_map = self._data_relay.get_bundle_store().get_has_map(limit_to=dict(braid.items()))
        return has_map.to_greeting_message()

    @override
    def _on_listener_ready(self, listener: Listener) -> Iterable[Selectable]:
        """ Called when a listener is ready to accept a connection.
            Attempts to accept the connection, then returns the connection as a list.

            If the connection is not accepted, then an empty list is returned.
        """
        (socket, addr) = listener.accept()
        context = listener.get_context()
        if context:
            try:
                socket = context.wrap_socket(socket, server_side=True)
            except SSLError as ssl_error:
                self._logger.warning("failed to secure connection", exc_info=ssl_error)
                return []

        self._count_connections += 1
        connection: Connection = Connection(
            socket=socket,
            host=addr[0],
            port=addr[1],
            conn_func=self._get_greeting,
            auth_func=listener.get_auth_func(),
            name="connection #%s from %s" % (self._count_connections, addr[0]),
            on_ws_act=self._on_websocket_ready,
            wsgi_func=self._wsgi_func,
        )
        self._add_selectable(connection)
        self._logger.info("accepted incoming connection from %s", addr[0])
        return [connection]

    def _on_websocket_ready(self, connection: Connection):
        braid = None
        try:
            for thing in connection.receive_objects():
                braid = braid or self._connection_braid_map.get(connection)
                if isinstance(thing, Decomposition):  # some data
                    if not connection.get_permissions() & AUTH_RITE:
                        self._logger.debug("ignoring bundle from connection without write perms")
                        continue
                    if braid is None:
                        raise Finished("don't have braid for this connection")
                    info = thing.get_info()
                    chain = info.get_chain()
                    if chain not in braid:
                        if info.timestamp != info.chain_start:
                            self._logger.warning("connection tried pushing non-start to a braid")
                            raise Finished()
                        braid.set(chain, inf)
                        connected_to_this_braid = self._braid_connection_map[braid]
                        for conn in list(connected_to_this_braid):
                            self._chain_connections_map[chain].add(conn)
                    self._data_relay.receive(thing)
                    connection.send(thing.get_info().as_acknowledgement())
                elif isinstance(thing, HasMap):  # greeting message
                    if not connection.get_permissions() & AUTH_READ:
                        self._logger.debug("ignoring greeting from connection without read perms")
                        continue
                    if braid is None:
                        raise Finished("don't have braid for this connection")
                    self._data_relay.get_bundle_store().get_bundles(
                        connection.send_bundle, peer_has=thing, limit_to=dict(braid.items()))
                elif isinstance(thing, BundleInfo):  # an ack:
                    pass
                else:
                    raise Finished(f"unexpected object {thing}")
        except Finished:
            braid = self._connection_braid_map.pop(connection, None)
            if braid:
                for chain, _ in braid.items():
                    self._chain_connections_map[chain].discard(connection)
                self._braid_connection_map[braid].discard(connection)
            self._remove_selectable(connection)
            raise
