from typing import *
from logging import getLogger
from ssl import SSLError
from typing_extensions import override
from pathlib import Path

from .builders import SyncMessage
from .database import Database
from .listener import Listener
from .connection import Connection
from .relay import Relay
from .typedefs import inf, AUTH_READ, AUTH_RITE, AuthFunc, ConnectionInterface
from .server import Server
from .looping import Selectable
from .braid import Braid
from .directory import Directory
from .box import Box
from .muid import Muid
from .looping import Finished
from .decomposition import Decomposition
from .has_map import HasMap
from .bundle_info import BundleInfo
from .utilities import experimental

@experimental
class BraidServer(Server):

    def __init__(
            self, *,
            data_relay: Relay,
            control_db: Database,
            auth_func: Optional[AuthFunc] = None,
            app_id: Optional[str] = None,
            wsgi_func: Optional[Callable] = None,
    ):
        super().__init__()
        self._connection_braid_map: Dict[ConnectionInterface, Braid] = dict()
        data_relay.add_callback(self._after_relay_recieves_bundle)
        self._data_relay = data_relay
        self._control_db = control_db
        self._logger = getLogger(self.__class__.__name__)
        self._count_connections = 0
        self._wsgi_func = wsgi_func
        self._app_id = app_id
        self._auth_func = auth_func
        self._app_directory = self._get_app_directory()

    def _get_app_directory(self) -> Directory:
        """ Get's the base directory for this particular applicaiton.

            We want each app to be based in a user-created directory, with appropriate
            sub-directories for auth, braids, etc., so that if this db ever gets merged with
            another database from a different app, those two apps don't merge their data.

            If an app_id is specified, then we use a directory linked to from the root
            directory using app_id as the key (creating it if it doesn't exist).  If no
            app_id is given, then we have the application root directory linked to from
            the global box (creating if a directory isn't there).
        """
        box = Box(muid=Muid(-1,-1,Box.get_behavior()), database=self._control_db)
        box_contents = box.get()
        if self._app_id is not None:
            control_root = Directory(root=True, database=self._control_db)
            if self._app_id in control_root:
                directory = control_root[self._app_id]
                if not isinstance(directory, Directory):
                    raise ValueError(f"/{self._app_id} points to a {type(directory)}")
                return directory
            else:
                directory = Directory(database=self._control_db)
                control_root[self._app_id] = directory
                return directory
        else:
            if isinstance(box_contents, Directory):
                return box_contents
            directory = Directory(database=self._control_db)
            box.set(directory)
            return directory

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
        chain = info.get_chain()
        # TODO: do something more efficient than looping over connections
        for connection, braid in self._connection_braid_map.items():
            self._logger.debug("considering connection: %s", connection.name)
            if braid.get(chain, 0) > info.timestamp:
                # Note: connection internally keeps track of what peer has and will prevent echo
                connection.send_bundle(decomposition)

    def _get_greeting(self, connection: ConnectionInterface) -> SyncMessage:
        braids: Directory
        braids = self._app_directory.setdefault("braids", default_factory=lambda: Directory(database=self._control_db))
        braid = braids.setdefault(connection.path, default_factory=lambda: Braid(database=self._control_db))
        self._connection_braid_map[connection] = braid
        has_map = self._data_relay.get_store().get_has_map(limit_to=dict(braid.items()))
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
                    self._data_relay.receive(thing)
                    connection.send(thing.get_info().as_acknowledgement())
                elif isinstance(thing, HasMap):  # greeting message
                    if not connection.get_permissions() & AUTH_READ:
                        self._logger.debug("ignoring greeting from connection without read perms")
                        continue
                    if braid is None:
                        raise Finished("don't have braid for this connection")
                    self._data_relay.get_store().get_bundles(
                        connection.send_bundle, peer_has=thing, limit_to=dict(braid.items()))
                elif isinstance(thing, BundleInfo):  # an ack:
                    pass
                else:
                    raise Finished(f"unexpected object {thing}")
        except Finished:
            self._connection_braid_map.pop(connection, None)
            self._remove_selectable(connection)
            raise
