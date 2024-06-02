""" Contains the WsPeer class to manage a connection to a websocket (gink) peer. """

# batteries included python imports
from typing import Iterable, Optional, Callable
from pathlib import Path
from socket import (
    socket as Socket,
    SHUT_WR, SHUT_RDWR
)

from .utilities import decodeFromHex, encodeToHex

# modules from requirements.txt
from wsproto import WSConnection, ConnectionType
from wsproto.events import (
    Request,
    AcceptConnection,
    CloseConnection,
    BytesMessage,
    TextMessage,
    Ping,
    Pong,
    RejectConnection
)

# builders
from .builders import SyncMessage

# gink modules
from .connection import Connection
from .looping import Finished
from .typedefs import AuthFunc, AUTH_FULL, AUTH_RITE


class WebsocketConnection(Connection):
    """ Manages the connection to one peer via a websocket.

        Set force_to_be_client to indicate that the provided socket is a client connection.
        If there's no socket provided then one will be established, and force_to_be_client is implied.
    """
    PROTOCOL = "gink"
    on_ready: Callable
    _path: Optional[str]
    def __init__(
            self, *,
            host: Optional[str] = None,
            port: Optional[int] = None,
            socket: Optional[Socket] = None,
            force_to_be_client: bool = False,
            path: Optional[str] = None,
            sync_func: Optional[Callable[[Path], SyncMessage]] = None,
            auth_func: Optional[AuthFunc] = None,
            auth_data: Optional[str] = None,
            permissions: int = AUTH_FULL,
    ):
        Connection.__init__(self, socket=socket, host=host, port=port)
        if socket is None:
            force_to_be_client = True
        connection_type = ConnectionType.CLIENT if force_to_be_client else ConnectionType.SERVER
        self._ws = WSConnection(connection_type=connection_type)
        self._ws_closed = False
        self._buffered: bytes = b""
        self._ready = False
        if force_to_be_client:
            subprotocols = [self.PROTOCOL]
            if auth_data:
                subprotocols.append(encodeToHex(auth_data))
            host = host or "localhost"
            self._path = path or "/"
            request = Request(host=host, target=self._path, subprotocols=subprotocols)
            self._socket.send(self._ws.send(request))
        else:
            self._path = None
        self._logger.debug("finished setup")
        self._socket.settimeout(0.2)
        self._auth_func = auth_func
        self._sync_func = sync_func
        self._permissions: int = 0 if auth_func else permissions

    def is_alive(self) -> bool:
        return not (self._ws_closed or self._closed)

    def __repr__(self):
        return f"{self.__class__.__name__}(host={self._host!r})"

    def receive(self) -> Iterable[SyncMessage]:
        if self._closed:
            raise Finished()
        data = self._socket.recv(4096 * 4096)
        if not data:
            self._ws_closed = True
            raise Finished()
        self._ws.receive_data(data)
        for event in self._ws.events():
            if isinstance(event, Request):
                if "?" in event.target:
                    (self._path, _) = event.target.split("?", 2)
                else:
                    self._path = event.target
                if self._auth_func:
                    for protocol in event.subprotocols:
                        if protocol.lower().startswith("0x"):
                            decoded = decodeFromHex(protocol)
                            assert self._path is not None
                            self._permissions |= self._auth_func(decoded, Path(self._path))
                if not self._permissions:
                    self._logger.warning("could not authenticated connection")
                    self._socket.send(self._ws.send(RejectConnection()))
                elif "gink" not in event.subprotocols:
                    self._logger.warning("got a non gink connection attempt")
                    self._socket.send(self._ws.send(RejectConnection()))
                else:
                    self._logger.debug("got a Request, sending an AcceptConnection")
                    self._socket.send(self._ws.send(AcceptConnection("gink")))
                    self._logger.info("Server connection established!")
                    if self._permissions & AUTH_RITE:
                        self._send_greeting()
                    self._ready = True
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
                self._logger.debug('We got %d bytes!', len(received))
                if event.message_finished:
                    if self._buffered:
                        received = self._buffered + received
                        self._buffered = b""
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
                if self._permissions & AUTH_RITE:
                    self._send_greeting()
                self._ready = True
            else:
                self._logger.warning("got an unexpected event type: %s", event)

    def _send_greeting(self):
        if self._sync_func is None or self._path is None:
            self._logger.warning("cannot send greeting message")
            return
        greeting = self._sync_func(Path(self._path))
        sent = self.send(greeting)
        self._logger.debug("sent greeting of %d bytes", sent)

    def send(self, sync_message: SyncMessage) -> int:
        assert not self._closed
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
