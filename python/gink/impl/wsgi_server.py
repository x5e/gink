"""
WSGIServer is essentially a wrapper around an unknown WSGI application (flask, django, etc).
The point of this class is to integrate within the Database select loop.
"""

import socket
from io import StringIO
from sys import stderr
from datetime import datetime
from typing import Iterable

class WSGIServer():
    address_family = socket.AF_INET
    socket_type = socket.SOCK_STREAM
    request_queue_size = 1024

    def __init__(self, address: tuple = ('localhost', 8081), app=None):
        self.listen_socket = listen_socket = socket.socket(
            self.address_family,
            self.socket_type
        )

        listen_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listen_socket.setblocking(False)
        listen_socket.bind(address)
        listen_socket.listen(self.request_queue_size)
        print(f"Web server listening on port {address[1]}")

        host, port = self.listen_socket.getsockname()[:2]
        self.server_name = socket.getfqdn(host)
        self.server_port = port
        self.headers_set: list[str] = []

        # app would be the equivalent of a Flask app, or other WSGI compatible application
        self.application = app

    @staticmethod
    def parse_request(text: str):
        request_line = text.splitlines()[0]
        request_line = request_line.rstrip('\r\n')
        return request_line.split()

    def get_environ(self, request_data, request_method, path):
        # TODO: Ensure this follows PEP8 conventions
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

    def start_response(self, status, response_headers, exc_info=None):
        server_headers = [
            ('Date', datetime.now()),
            ('Server', 'WSGIServer 0.2'),
        ]
        self.headers_set = [status, response_headers + server_headers]
        # TODO: Need to return a "write" callable to adhere to WSGI specifications
        # https://peps.python.org/pep-3333/#the-write-callable

    def finish_response(self, result: Iterable[bytes], conn: socket.socket):
        status, response_headers = self.headers_set
        response = f'HTTP/1.1 {status}\r\n'
        for header in response_headers:
            response += '{0}: {1}\r\n'.format(*header)
        response += '\r\n'
        for data in result:
            response += data.decode('utf-8')
        print(f'HTTP/1.1 {status}')
        response_bytes = response.encode()
        conn.sendall(response_bytes)
