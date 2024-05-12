"""
WSGIServer is a wrapper around an unknown WSGI application (flask, django, etc).
The point of this class is to integrate within the Database select loop.
"""

import socket
from inspect import getfullargspec
from io import StringIO
from sys import stderr
from datetime import datetime
from typing import Iterable, Optional
from errno import EINTR
from logging import Logger

from .wsgi_connection import WsgiConnection

class WsgiListener():
    address_family = socket.AF_INET
    socket_type = socket.SOCK_STREAM
    request_queue_size = 1024

    def __init__(self, app, address: tuple = ('localhost', 8081), logger: Optional[Logger] = None):
        # app would be the equivalent of a Flask app, or other WSGI compatible application
        app_args = getfullargspec(app).args
        assert "environ" in app_args and "start_response" in app_args, "Application is not WSGI compatible"
        self.application = app

        self.listen_socket = listen_socket = socket.socket(
            self.address_family,
            self.socket_type
        )
        self.fd = self.listen_socket.fileno()
        self.logger = logger

        listen_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listen_socket.setblocking(False)
        listen_socket.bind(address)
        listen_socket.listen(self.request_queue_size)
        print(f"Web server listening on port {address[1]}")

        host, port = self.listen_socket.getsockname()[:2]
        self.server_name = socket.getfqdn(host)
        self.server_port = port
        self.headers_set: list[str] = []

    def fileno(self):
        return self.fd

    def accept(self):
        try:
            conn, _ = self.listen_socket.accept()
        except BlockingIOError as e:
            code, msg = e.args
            if code == EINTR:
                conn = None
            else:
                raise e
        return WsgiConnection(conn)

    @staticmethod
    def parse_request(text: str):
        request_line = text.splitlines()[0]
        request_line = request_line.rstrip('\r\n')
        return request_line.split()

    def get_environ(self, request_data, request_method, path):
        return {
            'wsgi.version':  (1, 0),
            'wsgi.url_scheme': 'http',
            'wsgi.input': StringIO(request_data),
            'wsgi.errors': stderr,
            'wsgi.multithread': False,
            'wsgi.multiprocess': False,
            'wsgi.run_once': False,
            'REQUEST_METHOD': request_method,
            'PATH_INFO': path,
            'SERVER_NAME': self.server_name,
            'SERVER_PORT': str(self.server_port)
        }

    def start_response(self, status, response_headers, exc_info: Optional[tuple]=None):
        server_headers = [
            ('Date', datetime.now()),
            ('Server', 'WSGIServer 0.2'),
        ]

        # If headers have already been sent
        if exc_info and self.headers_set:
            raise exc_info[1].with_traceback(exc_info[2])

        self.headers_set = [status, response_headers + server_headers]

        return self.write

    def write(self, string: str):
            raise NotImplementedError("Using the write callable has not been implemented.")

    def finish_response(self, result: Iterable[bytes], conn: WsgiConnection):
        status, response_headers = self.headers_set
        response = f'HTTP/1.0 {status}\r\n'
        for header in response_headers:
            response += '{0}: {1}\r\n'.format(*header)
        response += '\r\n'
        for data in result:
            if isinstance(data, bytes):
                response += data.decode('utf-8')
            else:
                response += data
        if self.logger:
            self.logger.debug(f'HTTP/1.0 {status}')
        response_bytes = response.encode()
        conn.sendall(response_bytes)

    def process_request(self, request_data: Optional[bytes]):
        """
        Holds all of the request processing that does not involve a connection.
        The result from this method will need to be passed to finish_response along
        with the connection.
        """
        if not request_data:
            return False
        decoded = request_data.decode('utf-8')
        if self.logger:
            self.logger.debug(''.join(f'< {line}\n' for line in decoded.splitlines()))
        (request_method, path, request_version) = WsgiListener.parse_request(decoded)
        env = self.get_environ(decoded, request_method, path)
        result = self.application(env, self.start_response)
        return result
