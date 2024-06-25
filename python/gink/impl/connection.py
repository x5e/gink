""" Contains the WsPeer class to manage a connection to a websocket (gink) peer. """

# batteries included python imports
from typing import Iterable, Optional, Callable, Union
from pathlib import Path
from ssl import create_default_context
from logging import getLogger
from socket import (
    socket as Socket,
    SHUT_WR
)
from socket import (
    socket as Socket,
    AF_INET,
    SOCK_STREAM,
)

# modules from requirements.txt
from wsproto import WSConnection, ConnectionType
from wsproto.utilities import RemoteProtocolError
from wsproto.events import (
    Request,
    AcceptConnection,
    CloseConnection,
    BytesMessage,
    TextMessage,
    Ping,
    Pong,
    RejectConnection,
)

# gink modules
from .builders import SyncMessage
from .looping import Finished
from .typedefs import AuthFunc, AUTH_FULL, AUTH_RITE
from .sync_func import SyncFunc
from .bundle_info import BundleInfo
from .bundle_wrapper import BundleWrapper
from .chain_tracker import ChainTracker
from .utilities import decode_from_hex, encode_to_hex


class Connection:
    """ Manages the connection to one peer via a websocket.

        Set is_client to indicate that the provided socket is a client connection.
        If there's no socket provided then one will be established, and is_client is implied.
    """
    PROTOCOL = "gink"
    on_ready: Callable
    _path: Path

    def __init__(
            self, *,
            host: Optional[str] = None,
            port: Optional[int] = None,
            socket: Optional[Socket] = None,
            is_client: Optional[bool] = None,
            path: Optional[str] = None,
            name: Optional[str] = None,
            wsgi: Optional[Callable] = None,
            sync_func: Optional[SyncFunc] = None,
            auth_func: Optional[AuthFunc] = None,
            auth_data: Optional[str] = None,
            permissions: int = AUTH_FULL,
            secure_connection: bool = False,
    ):
        if socket is None:
            is_client = True
            assert host is not None and port is not None
            socket = Socket(AF_INET, SOCK_STREAM)
            if secure_connection:
                context = create_default_context()
                socket = context.wrap_socket(socket, server_hostname = host)
            socket.connect((host, port))
        self._socket = socket
        self._host = host
        self._port = port
        self._logger = getLogger(self.__class__.__name__)
        self._closed = False
        self._tracker: Optional[ChainTracker] = None
        self._name = name
        connection_type = ConnectionType.CLIENT if is_client else ConnectionType.SERVER
        self._ws = WSConnection(connection_type=connection_type)
        self._ws_closed = False
        self._buffered: bytes = b""
        self._ready = False
        self._wsgi = wsgi
        if is_client:
            subprotocols = [self.PROTOCOL]
            if auth_data:
                subprotocols.append(encode_to_hex(auth_data))
            host = host or "localhost"
            self._path = Path(path or "/")
            request = Request(host=host, target=str(self._path), subprotocols=subprotocols)
            self._socket.send(self._ws.send(request))
        self._logger.debug("finished setup")
        self._socket.settimeout(0.2)
        self._auth_func = auth_func
        self._sync_func = sync_func
        self._perms: int = 0 if auth_func else permissions
        self._buff: Optional[bytes] = b""

    def is_alive(self) -> bool:
        return not (self._ws_closed or self._closed)

    def __repr__(self):
        return f"{self.__class__.__name__}(host={self._host!r})"

    def receive(self) -> Iterable[SyncMessage]:
        """ receive a (possibly empty) series of encoded SyncMessages from a peer. """
        if self._closed:
            raise Finished()
        data = self._socket.recv(4096 * 4096)
        if not data:
            self._ws_closed = True
            raise Finished()
        if isinstance(self._buff, bytes):
            self._buff += data
        try:
            self._ws.receive_data(data)
        except RemoteProtocolError as rpe:
            if rpe.args and rpe.args[0] == "Missing header, 'Connection: Upgrade'":
                print(rpe)
            else:
                self._logger.warning("rejected a malformed connection attempt")
                self._socket.send(self._ws.send(rpe.event_hint))
                raise Finished()
        for event in self._ws.events():
            self._buff = None
            if isinstance(event, Request):
                if "?" in event.target:
                    (path, _) = event.target.split("?", 2)
                else:
                    path = event.target
                self._path = Path(path)
                if self._auth_func:
                    for protocol in event.subprotocols:
                        if protocol.lower().startswith("0x"):
                            decoded = decode_from_hex(protocol)
                            assert self._path is not None
                            self._perms |= self._auth_func(decoded, self._path)
                if not self._perms:
                    self._logger.warning("rejected a connection due to insufficient permissions")
                    self._socket.send(self._ws.send(RejectConnection()))
                    raise Finished()
                if "gink" not in event.subprotocols:
                    self._logger.warning("rejected a non-gink connection")
                    self._socket.send(self._ws.send(RejectConnection()))
                    raise Finished()
                greeting = None
                try:
                    if self._sync_func is not None:
                        greeting = self._sync_func(path=self._path, perms=self._perms, misc=self)
                except Exception as exception:
                    self._logger.warning(f"could not generate greeting", exc_info=exception)
                    self._socket.send(self._ws.send(RejectConnection()))
                    self._ws_closed = True
                    raise Finished()
                self._logger.debug("got a Request, sending an AcceptConnection")
                self._socket.send(self._ws.send(AcceptConnection("gink")))
                self._logger.info("Server connection established!")
                self._ready = True
                if greeting and self._perms & AUTH_RITE:
                    sent = self.send(greeting)
                    self._logger.debug("sent greeting of %d bytes (%s)", sent, self._name)
            elif isinstance(event, CloseConnection):
                self._logger.info("got close msg, code=%d, reason=%s", event.code, event.reason)
                try:
                    self._socket.send(self._ws.send(event.response()))
                except BrokenPipeError:
                    self._logger.warning("could not send websocket close ack")
                self._ws_closed = True
                raise Finished()
            elif isinstance(event, TextMessage):
                self._logger.info('Text message received: %r', event.data)
            elif isinstance(event, BytesMessage):
                received = bytes(event.data) if isinstance(event.data, bytearray) else event.data
                assert isinstance(received, bytes)
                if event.message_finished:
                    if self._buffered:
                        received = self._buffered + received
                        self._buffered = b""
                    self._logger.debug('We got %d bytes! (%s)', len(received), self._name)
                    sync_message = SyncMessage()
                    sync_message.ParseFromString(received)
                    yield sync_message
                else:
                    self._buffered += bytes(event.data)
            elif isinstance(event, Ping):
                self._logger.debug("received ping")
                self._socket.send(self._ws.send(event.response()))
            elif isinstance(event, Pong):
                self._logger.debug("received pong")
            elif isinstance(event, AcceptConnection):
                self._logger.info("Client connection established!")
                self._ready = True
                if self._sync_func and self._perms & AUTH_RITE:
                    greeting = self._sync_func(path=self._path, perms=self._perms, misc=self)
                    sent = self.send(greeting)
                    self._logger.debug("sent greeting of %d bytes (%s)", sent, self._name)
            elif isinstance(event, RejectConnection):
                self._ws_closed = True
                raise Finished()
            else:
                self._logger.warning("got an unexpected event type: %s", event)

    def send(self, sync_message: SyncMessage) -> int:
        """ Send an encoded SyncMessage to a peer. """
        if self._closed:
            raise ValueError("connection already closed!")
        if self._ws_closed:
            raise ValueError("websocket shut down")
        if not self._ready:
            raise ValueError("connection not ready!")
        data = self._ws.send(BytesMessage(sync_message.SerializeToString()))
        return self._socket.send(data)

    def close(self, reason=None):
        if self._closed:
            return
        code = 1000
        if reason is not None:
            raise NotImplementedError()
        try:
            if not self._ws_closed:
                self._socket.send(self._ws.send(CloseConnection(code=code)))
                self._socket.shutdown(SHUT_WR)
                self._ws_closed = True
            """
            self._logger.debug("Sent connection close message, waiting for close ack.")
            while True:
                ready = select([self._socket], [], [], 0.2)
                if not ready[0]:
                    self._logger.warning("timed out waiting for peer to ack my close message")
                    break
                data = self._socket.recv(2 ** 30)
                self._ws.receive_data(data)
                for event in self._ws.events():
                    if isinstance(event, CloseConnection):
                        self._logger.debug("Received close connnection ack.")
                        break
                    self._logger.warning("got something unexpected waiting for close: %s", event)
            """
        finally:
            self._socket.close()
            self._closed = True

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

    def get_name(self) -> Optional[str]:
        return self._name

    def get_permissions(self) -> int:
        return self._perms

    def fileno(self):
        """ Return the file descriptor of the underlying socket.
        """
        return self._socket.fileno()

    def is_closed(self) -> bool:
        """ a way to check if the connection is still active """
        return self._closed
