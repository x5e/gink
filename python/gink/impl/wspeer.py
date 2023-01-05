""" Contains the WsPeer class to manage a connection to a websocket (gink) peer. """

# batteries included python imports
from typing import Iterable, Union, Optional
from socket import (
    socket as Socket,
)

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
)

# gink modules
from .peer import Peer

class WsPeer(Peer):
    """ Manages the connection to one peer via a websocket connection.

        Set is_client to indicate that the provided socket is a client connection.
        If there's no socket provided then one will be established, and is_client is implied.
    """
    def __init__(
        self,
        host: Optional[str]=None,
        port: Optional[int]=None,
        socket: Optional[Socket]=None,
        is_client=False
    ):
        Peer.__init__(self, socket=socket, host=host, port=port)
        if socket is None:
            is_client = True
        self._ws = WSConnection(ConnectionType.CLIENT if is_client else ConnectionType.SERVER)
        self._buffered: bytes = b""

    def receive(self) -> Iterable[bytes]:
        data = self._socket.recv(2**30)
        self._ws.receive_data(data)
        for event in self._ws.events():
            if isinstance(event, Request):
                self._ws.send(AcceptConnection())
            elif isinstance(event, CloseConnection):
                self._logger.info("websocket closed, code=%d, reason=%s", event.code, event.reason)
                self._socket.send(self._ws.send(event.response()))
                Peer.close(self)
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
                self._ws.send(event.response())
            elif isinstance(event, Pong):
                self._logger.debug("received pong")
            else:
                self._logger.warning("got an unexpected event type: %s", event)

    def send(self, what: Union[bytes, str]):
        if isinstance(what, str):
            data = self._ws.send(TextMessage(what))
        else:
            data = self._ws.send(BytesMessage(what))
        self._socket.send(data)

    def close(self, reason=None):
        code = 1000
        if reason is not None:
            raise NotImplementedError()
        self._socket.send(self._ws.send(CloseConnection(code=code)))
        Peer.close(self)
