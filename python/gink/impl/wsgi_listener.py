"""
WSGIServer is a wrapper around an unknown WSGI application (flask, django, etc).
The point of this class is to integrate within the Database select loop.
"""

from socket import socket as Socket, SOL_SOCKET, SO_REUSEADDR, AF_INET, SOCK_STREAM
from logging import getLogger
from typing import Iterable, List

from .connection import Connection
from .looping import Selectable


class WsgiListener(Selectable):
    address_family = AF_INET
    socket_type = SOCK_STREAM
    request_queue_size = 1024

    def __init__(self, app, ip_addr: str = "", port: int = 8081):
        self._app = app
        self._socket = Socket(self.address_family, self.socket_type)
        self._fd = self._socket.fileno()
        self._logger = getLogger(self.__class__.__name__)
        self._socket.setsockopt(SOL_SOCKET, SO_REUSEADDR, 1)
        self._socket.setblocking(False)
        self._socket.bind((ip_addr, port))
        self._socket.listen(self.request_queue_size)
        self._logger.info(f"Web server listening on interface: '{ip_addr}' port {port}")
        self._server_port = port
        self._headers_set: List[str] = []
        self._closed = False

    def fileno(self) -> int:
        return self._fd

    def on_ready(self) -> Iterable[Connection]:
        socket, _ = self._socket.accept()
        yield Connection(
            wsgi_func=self._app,
            socket=socket,
            port=self._server_port)

    def close(self):
        self._socket.close()
        self._closed = True

    def is_closed(self) -> bool:
        return self._closed
