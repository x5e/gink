""" Contains the WsPeer class to manage a connection to a websocket (gink) peer. """

# batteries included python imports
from typing import Iterable, Optional, Callable, Union, List
from wsgiref.handlers import format_date_time
from pathlib import Path
from ssl import create_default_context, SSLSocket
from logging import getLogger
from io import BytesIO
from re import fullmatch, DOTALL
from time import time as get_time
from sys import stderr
from socket import (
    socket as Socket,
    SHUT_WR
)
from socket import (
    socket as Socket,
    AF_INET,
    SOCK_STREAM,
)

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
from .typedefs import AuthFunc, AUTH_NONE, AUTH_RITE
from .sync_func import SyncFunc
from .bundle_info import BundleInfo
from .decomposition import Decomposition
from .has_map import HasMap
from .utilities import decode_from_hex, encode_to_hex, dedent


class Connection:
    """ Manages a selectable connection.

        The connection could end up either being an incoming http(s) request, or a bidirectional
        websocket, and we don't know which it'll be at the time the connection is made.

    """
    PROTOCOL = "gink"
    _path: str

    def __init__(
            self, *,
            host: Optional[str] = None,
            port: Optional[int] = None,
            socket: Optional[Socket] = None,
            is_client: Optional[bool] = None,
            path: Optional[str] = None,
            name: Optional[str] = None,
            on_ws_act: Optional[Callable] = None,
            wsgi_func: Optional[Callable] = None,
            sync_func: Optional[SyncFunc] = None,
            auth_func: Optional[AuthFunc] = None,
            auth_data: Optional[str] = None,  # only relevant when used as a client
            permissions: int = AUTH_NONE,     # default permissions when used as a server
            secure_connection: bool = False,
    ):
        if socket is None:
            is_client = True
            assert host is not None and port is not None
            socket = Socket(AF_INET, SOCK_STREAM)
            if secure_connection:
                context = create_default_context()
                socket = context.wrap_socket(socket, server_hostname=host)
            socket.connect((host, port))
        self._socket: Union[Socket, SSLSocket] = socket
        self._host = host
        self._port = port
        self._logger = getLogger(self.__class__.__name__)
        self._closed = False
        self._tracker: Optional[HasMap] = None
        self._name = name
        connection_type = ConnectionType.CLIENT if is_client else ConnectionType.SERVER
        self._ws = WSConnection(connection_type=connection_type)
        self._ws_closed = False
        self._ws_connected = False
        self._wsgi = wsgi_func
        self._on_ws_act = on_ws_act
        if is_client:
            subprotocols = [self.PROTOCOL]
            if auth_data:
                subprotocols.append(encode_to_hex(auth_data))
            host = host or "localhost"
            self._path = path or "/"
            request = Request(host=host, target=str(self._path), subprotocols=subprotocols)
            self._socket.send(self._ws.send(request))
        self._logger.debug("finished setup")
        self._socket.settimeout(0.2)
        self._auth_func = auth_func
        self._sync_func = sync_func
        self._perms: int = 0 if auth_func else permissions
        self._buffer: bytes = b""
        self._message_buffer: bytes = b""  # New buffer specifically for partial messages
        self._need_header = not is_client
        self._pending = False
        self._is_websocket = is_client
        self._server_name = "unknown"
        self._request_headers: Optional[dict] = None
        self._response_headers: Optional[List[tuple]] = None
        self._status: Optional[str] = None
        self._response_started = False
        self._header: Optional[bytes] = None
        self._request_method: Optional[str] = None
        self._decoded: Optional[str] = None

    @property
    def headers(self):
        assert self._request_headers
        return self._request_headers

    @property
    def cookies(self) -> dict:
        return dict(
            pair.strip().split('=', 1)
            for pair in self.headers["cookies"].split(';')
            if '=' in pair
        )

    @property
    def path(self):
        assert self._path
        return self._path

    @property
    def authorization(self) -> Optional[str]:
        if self._decoded:
            return self._decoded
        else:
            return self.headers.get("authorization")

    def _handle_wsgi_request(self) -> None:
        if not self._wsgi:
            self._socket.sendall(dedent(b"""
                HTTP/1.0 400 Bad Request
                Content-type: text/plain

                Websocket connections only!"""))
            raise Finished()
        assert self._request_headers
        if int(self._request_headers.get("content-length", "0")) != len(self._body):
            # TODO wait for the rest of the body then process the post/put request
            self._socket.sendall(b"HTTP/1.0 500 Internal Server Error\r\n\r\n")
            self._logger.warning("improper HTTP POST handling, please fix me")
            raise Finished()
        if "host" in self._request_headers:
            self._server_name = self._request_headers["host"].split(":")[0]
        env = {
            'wsgi.version': (1, 0),
            'wsgi.url_scheme': 'http',
            'wsgi.input': BytesIO(self._body),
            'wsgi.errors': stderr,
            'wsgi.multithread': False,
            'wsgi.multiprocess': False,
            'wsgi.run_once': False,
            'REQUEST_METHOD': self._request_method,
            'PATH_INFO': self._path,
            'SERVER_NAME': self._server_name,
            'SERVER_PORT': str(self._port),
        }
        if "content-type" in self._request_headers:
            env['HTTP_CONTENT_TYPE'] = self._request_headers["content-type"]

        if "authorization" in self._request_headers:
            env['HTTP_AUTHORIZATION'] = self._request_headers["authorization"]
        try:
            result: Iterable[bytes] = self._wsgi(env, self._start_response)
            for data in result:
                if data:
                    self._write(data)
            if not self._response_started:
                self._write(b"")
        except Exception as exception:
            if not self._response_started:
                self._start_response(
                    "500 Internal Server Error", [("Content-type", "text/plain")])
                self._write(str(exception).encode("utf-8"))
            raise Finished(exception)
        raise Finished()  # will cause the loop to call close after deregistering

    def _receive_header(self) -> bool:
        data = self._socket.recv(4096 * 16)
        if not data:
            raise Finished()
        self._buffer += data
        match = fullmatch(rb"(.+)\r?\n\r?\n(.*)", self._buffer, DOTALL)
        if not match:
            return False# wait until we get more data
        self._need_header = False
        self._header = match.group(1)
        self._body = match.group(2)
        header_lines = self._header.decode('utf-8').splitlines()
        if len(header_lines) == 0:
            self._logger.warning("bad request")
            raise Finished()
        (self._request_method, self._path, _) = header_lines.pop(0).split(maxsplit=3)
        self._request_headers = {}
        for header_line in header_lines:
            key, val = header_line.split(":", 1)
            self._request_headers[key.strip().lower()] = val.strip()
        if "upgrade" in self._request_headers.get("connection", "").lower():
            if not self._on_ws_act:
                self._socket.sendall(dedent(b"""
                    HTTP/1.0 400 Bad Request
                    Content-type: text/plain

                    no websocket handler configured"""))
                self._logger.warning("websocket connection without handler set")
                raise Finished()
            self._is_websocket = True
            self._pending = True
        return True

    def on_ready(self) -> None:
        """ Called when the connection is ready to be used.
            Handles both websocket requests, and http(s) requests if a WSGI function is provided.
        """
        if self._need_header:
            received = self._receive_header()
            if not received:
                return
        if self._is_websocket:
            assert self._on_ws_act
            self._on_ws_act(self)
        else:
            self._handle_wsgi_request()

    def _start_response(self, status: str, response_headers: List[tuple], exc_info=None):
        server_headers: List[tuple] = [
            ("Date", format_date_time(get_time())),
            ('Server', 'gink'),
        ]
        if exc_info and self._response_started:
            raise exc_info[1].with_traceback(exc_info[2])
        self._status = status
        self._response_headers = response_headers + server_headers
        return self._write

    def _write(self, blob: bytes):
        if self._status is None:
            raise ValueError("write before start_response")
        if not self._response_started:
            response = f'HTTP/1.0 {self._status}\r\n'
            assert self._response_headers is not None
            for header in self._response_headers:
                response += '{0}: {1}\r\n'.format(*header)
            response += '\r\n'
            self._socket.sendall(response.encode())
            self._response_started = True
        self._socket.sendall(blob)

    def is_alive(self) -> bool:
        return not (self._ws_closed or self._closed)

    def __repr__(self):
        return f"{self.__class__.__name__}(host={self._host!r})"

    def receive(self) -> Iterable[SyncMessage]:
        """ receive a (possibly empty) series of encoded SyncMessages from a peer. """
        if self._closed:
            raise Finished()
        if self._pending:
            self._pending = False  # previously called self._socket.recv
        else:
            try:
                data = self._socket.recv(4096)
            except TimeoutError:
                self._logger.warning("unexpected socket timeout")
                raise
            if not data:
                self._ws_closed = True
                raise Finished()
            self._buffer += data
        try:
            self._ws.receive_data(self._buffer)
            self._buffer = b""
        except RemoteProtocolError as rpe:
            self._logger.warning("rejected a malformed connection attempt")
            self._socket.send(self._ws.send(rpe.event_hint))
            raise Finished()
        for event in self._ws.events():
            if isinstance(event, Request):
                if "?" in event.target:
                    (path, _) = event.target.split("?", 2)
                else:
                    path = event.target
                self._path = path
                if self._auth_func:
                    for protocol in event.subprotocols:
                        if protocol.lower().startswith("0x"):
                            self._decoded = decode_from_hex(protocol)
                    self._perms |= self._auth_func(self)
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
                self._ws_connected = True
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
                if not event.message_finished:
                    self._message_buffer += received
                else:
                    final_message = received
                    if len(self._message_buffer) > 0:
                        # Combine with previous partial messages
                        final_message = self._message_buffer + received
                        self._message_buffer = b""
                    sync_message = SyncMessage()
                    sync_message.ParseFromString(final_message)
                    yield sync_message
            elif isinstance(event, Ping):
                self._logger.debug("received ping")
                self._socket.send(self._ws.send(event.response()))
            elif isinstance(event, Pong):
                self._logger.debug("received pong")
            elif isinstance(event, AcceptConnection):
                self._logger.info("Client connection established!")
                self._ws_connected = True
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
        if not self._ws_connected:
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
            if self._ws_connected and not self._ws_closed:
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

    def send_bundle(self, bundle_wrapper: Decomposition) -> None:
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

    def receive_objects(self) -> Iterable[Union[BundleInfo, Decomposition, HasMap]]:
        """ Receive BundleWrappers, BundleInfos, and/or HasMaps from a peer. """
        for sync_message in self.receive():
            if sync_message.HasField("bundle"):
                bundle_bytes = sync_message.bundle
                wrap = Decomposition(bundle_bytes)
                info = wrap.get_info()
                if self._tracker is not None:
                    self._tracker.mark_as_having(info)
                self._logger.debug("(%s) received bundle %s", self._name, info)
                yield wrap
            elif sync_message.HasField("greeting"):
                self._tracker = HasMap(sync_message=sync_message)
                self._logger.debug("(%s) received greeting %s", self._name, self._tracker)
                yield self._tracker
            elif sync_message.HasField("ack"):
                self._logger.debug("(%s) received ack %s", self._name, sync_message)
                yield BundleInfo.from_ack(sync_message)
            else:
                self._logger.warning("got binary message without ack, bundle, or greeting")

    def get_name(self) -> Optional[str]:
        return self._name

    def get_permissions(self) -> int:
        return self._perms

    def fileno(self):
        """ Return the file descriptor of the underlying socket. """
        return self._socket.fileno()

    def is_closed(self) -> bool:
        """ a way to check if the connection is still active """
        return self._closed
