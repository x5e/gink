from pathlib import Path
from typing import *
from logging import getLogger
from io import BytesIO
from ssl import SSLError

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
from .looping import Finished
from .bundle_wrapper import BundleWrapper
from .chain_tracker import ChainTracker
from .bundle_info import BundleInfo
from .utilities import decode_and_verify_jwt, generate_random_token


class BraidServer(Server):

    def __init__(
            self, *,
            data_relay: Relay,
            control_db: Database,
            auth_func: Optional[AuthFunc] = None,
            static_root: Optional[Path] = None,
            app_id: Optional[str] = None,
    ):
        super().__init__()
        self._braids: Dict[Connection, Braid] = dict()
        data_relay.add_callback(self._after_relay_recieves_bundle)
        self._data_relay = data_relay
        self._control_db = control_db
        self._auth_func = auth_func
        self._logger = getLogger(self.__class__.__name__)
        self._count_connections = 0
        self._static_path = static_root
        self._app_id = app_id

    def _get_app_directory(self) -> Directory:
        """ Get's the base directory for this particular applicaiton.

            We want each app to be based in a user-created directory, with appropriate
            sub-directories for auth, braids, etc., so that if this db ever gets merged with
            another database from a different app, those two apps don't merge their data.

            If an app_id is specified, then we use a directory linked to from the root
            directory using app_id as the key (creating it if it doesn't exist).  If no
            app_id is given, then we have the application root directory linked to from
            the archetype box (creating if a directory isn't there).
          """
        box = Box(arche=True, database=self._control_db)
        box_contents = box.get()
        if self._app_id is not None:
            control_root = Directory(arche=True, database=self._control_db)
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
        for selectable in self.get_selectables():
            if isinstance(selectable, Connection):
                yield selectable

    def _after_relay_recieves_bundle(self, bundle_wrapper: BundleWrapper) -> None:
        info = bundle_wrapper.get_info()
        chain = info.get_chain()
        # TODO: do something more efficient than looping over connections
        for connection, braid in self._braids.items():
            self._logger.debug("considering connection: %s", connection.get_name())
            if braid.get(chain, 0) > info.timestamp:
                # Note: connection internally keeps track of what peer has and will prevent echo
                connection.send_bundle(bundle_wrapper)

    def _get_braid(self, path: Path, create_if_missing: bool) -> Braid:
        parts = path.parts
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

    def _get_greeting(self, path: Path, perms: int, misc: Any) -> SyncMessage:
        try:
            braid = self._get_braid(path=path, create_if_missing=bool(perms & AUTH_MAKE))
        except ValueError as value_error:
            raise Finished(value_error)
        assert isinstance(misc, Connection)
        self._braids[misc] = braid
        ct = self._data_relay.get_store().get_chain_tracker(limit_to=dict(braid.items()))
        return ct.to_greeting_message()

    def _on_listener_ready(self, listener: Listener) -> Iterable[Selectable]:
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
            wsgi_func=self._on_http_request,
        )
        self._add_selectable(connection)
        self._logger.info("accepted incoming connection from %s", addr[0])
        return [connection]

    def _on_http_request(self, environ, start_response) -> Iterable[bytes]:
        request_method = environ["REQUEST_METHOD"]
        if request_method == "GET":
            if not self._static_path:
                start_response("200 OK", [("Content-type", "text/plain")])
                return [b"OK"]
            else:
                relative_path = environ.get("PATH_INFO", "/")
                assert ".." not in relative_path
                absolute_path = self._static_path.joinpath("." + relative_path)
                if absolute_path.exists() and absolute_path.is_file():
                    content_type = "text/html" if absolute_path.suffix == ".html" else "text/plain"
                    start_response("200 OK", [("Content-type", content_type)])
                    return [absolute_path.read_bytes()]
                else:
                    self._logger.warning(f"could not find: {absolute_path}")
                    start_response("404 Not Found", [("Content-type", "text/plain")])
                    return [b"not found\n"]
        elif request_method != "POST":
            start_response("400 Bad Request", [("Content-type", "text/plain")])
            return [b"bad request method"]
        app_directory = self._get_app_directory()
        tokens_directory = app_directory.get("tokens")
        if tokens_directory is None:
            tokens_directory = Directory(database=self._control_db)
            app_directory["tokens"] = tokens_directory
        assert isinstance(tokens_directory, Directory)
        stream = cast(BytesIO, environ["wsgi.input"])
        jwt_token = stream.read()
        try:
            claims = decode_and_verify_jwt(jwt_token, self._app_id)
        except ValueError as value_error:
            self._logger.warning("problem with jwt token", exc_info=value_error)
            start_response("400 Bad Request", [("Content-type", "text/plain")])
            return [b"problem with jwt token"]
        gink_token = generate_random_token()
        tokens_directory.set(gink_token, claims)
        start_response("200 OK", [("Content-type", "text/plain")])
        return [gink_token.encode()]

    def _on_websocket_ready(self, connection: Connection):
        braid = None
        try:
            for thing in connection.receive_objects():
                braid = braid or self._braids.get(connection)
                if isinstance(thing, BundleWrapper):  # some data
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
                elif isinstance(thing, ChainTracker):  # greeting message
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
