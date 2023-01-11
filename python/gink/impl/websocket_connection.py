""" Contains the WsPeer class to manage a connection to a websocket (gink) peer. """

# batteries included python imports
from typing import Iterable, Union, Optional
from socket import (
    socket as Socket,
    SHUT_WR, SHUT_RDWR
)
from select import select

# modules from requirements.txt
from wsproto import WSConnection, ConnectionType
from wsproto.events import(
    Request,
    AcceptConnection,
    CloseConnection,
    BytesMessage,
    TextMessage,
    Ping,
    Pong,
    RejectConnection
)

# gink modules
from .connection import Connection

class WebsocketConnection(Connection):
    """ Manages the connection to one peer via a websocket.

        Set is_client to indicate that the provided socket is a client connection.
        If there's no socket provided then one will be established, and is_client is implied.
    """
    PROTOCOL="gink"

    def __init__(
        self,
        host: Optional[str]=None,
        port: Optional[int]=None,
        socket: Optional[Socket]=None,
        force_to_be_client: bool=False,
        path: Optional[str]=None,
        greeting: Optional[bytes]=None
    ):
        Connection.__init__(self, socket=socket, host=host, port=port)
        if socket is None:
            force_to_be_client = True
        connection_type = ConnectionType.CLIENT if force_to_be_client else ConnectionType.SERVER
        self._ws = WSConnection(connection_type=connection_type)
        self._buffered: bytes = b""
        self._ready = False
        if force_to_be_client:
            # TODO: add cookie auth stuff into extra_headers
            host = host or "localhost"
            path = path or "/"
            request = Request(host="localhost", target=path, subprotocols=[self.PROTOCOL])
            self._socket.send(self._ws.send(request))
        self._logger.debug("finished setup")
        self._socket.settimeout(0.2)
        self._greeting = greeting

    def __repr__(self):
        return f"{self.__class__.__name__}(host={self._host!r})"

    def receive(self) -> Iterable[bytes]:
        if self._closed:
            return
        data = self._socket.recv(2**30)
        if not data:
            self._closed = True
        self._ws.receive_data(data)
        for event in self._ws.events():
            if isinstance(event, Request):
                if "gink" not in event.subprotocols:
                    self._logger.warning("got a non gink connection attempt")
                    self._socket.send(self._ws.send(RejectConnection()))
                else:
                    self._logger.debug("got a Request, sending an AcceptConnection")
                    self._socket.send(self._ws.send(AcceptConnection("gink")))
                    self._logger.info("Server connection established!")
                    if self._greeting is not None:
                        self._logger.debug("sending greeting of size %d", len(self._greeting))
                        self._socket.send(self._ws.send(BytesMessage(self._greeting)))
                    self._ready = True
            elif isinstance(event, CloseConnection):
                self._logger.info("got close msg, code=%d, reason=%s", event.code, event.reason)
                self._closed = True
                try:
                    self._socket.send(self._ws.send(event.response()))
                    self._socket.shutdown(SHUT_RDWR)
                except BrokenPipeError:
                    self._logger.warning("could not send websocket close ack")
                self._socket.close()
                return
            elif isinstance(event, TextMessage):
                self._logger.info('Text message received: %r', event.data)
            elif isinstance(event, BytesMessage):
                self._logger.debug('We got %d bytes!', len(event.data))
                if event.message_finished:
                    if self._buffered:
                        yield self._buffered + event.data
                        self._buffered = b""
                    else:
                        yield event.data
                else:
                    self._buffered += event.data
            elif isinstance(event, Ping):
                self._logger.debug("received ping")
                self._socket.send(self._ws.send(event.response()))
            elif isinstance(event, Pong):
                self._logger.debug("received pong")
            elif isinstance(event, AcceptConnection):
                self._logger.info("Client connection established!")
                if self._greeting is not None:
                    self._logger.debug("sending greeting of size %d", len(self._greeting))
                    self._socket.send(self._ws.send(BytesMessage(self._greeting)))
                self._ready = True
            else:
                self._logger.warning("got an unexpected event type: %s", event)

    def send(self, data: Union[bytes, str]):
        assert not self._closed
        if isinstance(data, str):
            data = self._ws.send(TextMessage(data))
        else:
            data = self._ws.send(BytesMessage(data))
        self._socket.send(data)

    def close(self, reason=None):
        self._closed = True
        code = 1000
        if reason is not None:
            raise NotImplementedError()
        try:
            self._socket.send(self._ws.send(CloseConnection(code=code)))
            self._socket.shutdown(SHUT_WR)
            self._logger.debug("Sent connection close message, waiting for close ack.")
            while True:
                ready = select([self._socket], [], [], 0.2)
                if not ready[0]:
                    self._logger.warning("timed out waiting for peer to ack my close message")
                    break
                data = self._socket.recv(2**30)
                self._ws.receive_data(data)
                for event in self._ws.events():
                    if isinstance(event, CloseConnection):
                        self._logger.debug("Received close connnection ack.")
                        break
                    self._logger.warning("got something unexpected waiting for close: %s", event)
        finally:
            self._socket.close()
