from typing import Iterable, Union, Optional
from socket import (
    socket as Socket, 
    SHUT_WR,

)

from wsproto import WSConnection, ConnectionType
from wsproto.events import (
    Request, 
    AcceptConnection, 
    CloseConnection, 
    BytesMessage, 
    TextMessage,
    Ping, 
    Pong,
)

from .peer import Peer

class WsPeer(Peer):

    def __init__(self, host: str, port: int, socket: Optional[Socket]=None):
        Peer.__init__(self, socket=socket, host=host, port=port)
        connection_type = ConnectionType.SERVER if socket else ConnectionType.CLIENT
        self._ws = WSConnection(connection_type)
        self._buffered: bytes = b""

    def receive(self) -> Iterable[bytes]:
        data = self._socket.recv(2**30)
        self._ws.receive_data(data)
        for event in self._ws.events():
            if isinstance(event, Request):
                self._ws.send(AcceptConnection())
            elif isinstance(event, CloseConnection):
                self._logger.info(f"got CloseConnection, code={event.code}, reason={event.reason}")
                self._socket.send(self._ws.send(event.response()))
                Peer.close(self)
                raise StopIteration() # probably a better exception than this
            elif isinstance(event, TextMessage):
                self._logger.info('Text message received:', event.data)
            elif isinstance(event, BytesMessage):
                self._logger.debug('We got bytes!', event.data)
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
                self._logger.warning(f"got an unexpected event type: {event}")

    def send(self, what: Union[bytes, str]):
        if isinstance(what, str):
            data = self._ws.send(TextMessage(what))
        else:
            data = self._ws.send(BytesMessage(what))
        self._socket.send(data)
