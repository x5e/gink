from pathlib import Path
from typing import *
from logging import getLogger
from ssl import SSLError
from typing_extensions import override

from .database import Database
from .listener import Listener
from .connection import Connection, SyncMessage
from .relay import Relay
from .typedefs import AuthFunc, AUTH_MAKE, AUTH_RITE, AUTH_READ, inf
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
        self._braids: Dict[Connection, Braid] = dict()
        data_relay.add_callback(self._after_relay_recieves_bundle)
        self._data_relay = data_relay
        self._control_db = control_db
        self._auth_func = auth_func
        self._logger = getLogger(self.__class__.__name__)
        self._count_connections = 0
        self._wsgi_func = wsgi_func
        self._app_id = app_id

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

    def _after_relay_recieves_bundle(self, bundle_wrapper: Decomposition) -> None:
        """ Internal callback that distributes a bundle to all connections when
            the relay receives a bundle.
        """
        info = bundle_wrapper.get_info()
        chain = info.get_chain()
        # TODO: do something more efficient than looping over connections
        for connection, braid in self._braids.items():
            self._logger.debug("considering connection: %s", connection.get_name())
            if braid.get(chain, 0) > info.timestamp:
                # Note: connection internally keeps track of what peer has and will prevent echo
                connection.send_bundle(bundle_wrapper)

    def _get_braid(self, path: str, create_if_missing: bool = False) -> Braid:
        """ Returns the braid associated with the given path, creating it create_if_missing is True.
        """
        parts = Path(path).parts
        if len(parts) == 0 or parts[0] == "/":
            raise ValueError(f"invaid path: {path}")
        directory_keys = list(parts[:-1])
        directory_keys.insert(0, 'braids')
        braid_key = parts[-1]
        current = self._get_app_directory()
        assert isinstance(current, Directory)
        for key in directory_keys:
            if create_if_missing and key not in current:
                self._logger.debug("creating intermediate directory for %s", key)
                current[key] = Directory(database=self._control_db)
            current = current.get(key)
            if not isinstance(current, Directory):
                raise ValueError(f"could not traverse: {key}")
        if create_if_missing and braid_key not in current:
            self._logger.debug("creating braid for %s", braid_key)
            current[braid_key] = Braid(database=self._control_db)
        braid = current[braid_key]
        if not isinstance(braid, Braid):
            raise ValueError("not a braid")
        return braid

    def _get_greeting(self, path: str, perms: int, misc: Any) -> SyncMessage:
        try:
            braid = self._get_braid(path=path, create_if_missing=bool(perms & AUTH_MAKE))
        except ValueError as value_error:
            raise Finished(value_error)
        assert isinstance(misc, Connection)
        self._braids[misc] = braid
        ct = self._data_relay.get_store().get_has_map(limit_to=dict(braid.items()))
        return ct.to_greeting_message()

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
            sync_func=self._get_greeting,
            auth_func=listener.get_auth(),
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
                braid = braid or self._braids.get(connection)
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
            self._braids.pop(connection, None)
            self._remove_selectable(connection)
            raise
