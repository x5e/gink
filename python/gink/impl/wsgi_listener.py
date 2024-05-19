"""
WSGIServer is a wrapper around an unknown WSGI application (flask, django, etc).
The point of this class is to integrate within the Database select loop.
"""

from socket import socket as Socket, SOL_SOCKET, SO_REUSEADDR, getfqdn, AF_INET, SOCK_STREAM
from inspect import getfullargspec
from errno import EINTR
from logging import getLogger

from .wsgi_connection import WsgiConnection

class WsgiListener():
    address_family = AF_INET
    socket_type = SOCK_STREAM
    request_queue_size = 1024

    def __init__(self, app, address: tuple = ('localhost', 8081)):
        # app would be the equivalent of a Flask app, or other WSGI compatible application
        app_args = getfullargspec(app).args
        assert "environ" in app_args and "start_response" in app_args, "Application is not WSGI compatible"
        self._app = app

        self._socket = Socket(self.address_family, self.socket_type)
        self._fd = self._socket.fileno()
        self._logger = getLogger(self.__class__.__name__)

        self._socket.setsockopt(SOL_SOCKET, SO_REUSEADDR, 1)
        self._socket.setblocking(False)
        self._socket.bind(address)
        self._socket.listen(self.request_queue_size)
        self._logger.info(f"Web server listening on port {address[1]}")

        host, port = self._socket.getsockname()[:2]
        self._server_name = getfqdn(host)
        self._server_port = port
        self._headers_set: list[str] = []

    def fileno(self) -> int:
        return self._fd

    def accept(self) -> WsgiConnection:
        try:
            conn, _ = self._socket.accept()
        except BlockingIOError as e:
            code, _ = e.args
            if code == EINTR:
                conn = None
            else:
                raise e
        return WsgiConnection(conn)
