"""
WSGIServer is essentially a wrapper around an unknown, WSGI application (flask, django, etc).
The point of this class is to integrate within the Database select loop.
"""

import socket
import io
import sys
from datetime import datetime

class WSGIServer():
    address_family = socket.AF_INET
    socket_type = socket.SOCK_STREAM
    request_queue_size = 1024

    def __init__(self, address, port=8081, app=None):
        self.listen_socket = listen_socket = socket.socket(
            self.address_family,
            self.socket_type
        )

        listen_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listen_socket.setblocking(0)
        listen_socket.bind((address, port))
        listen_socket.listen(self.request_queue_size)
        print("Web server listening on port 8081")

        host, port = self.listen_socket.getsockname()[:2]
        self.server_name = socket.getfqdn(host)
        self.server_port = port
        self.headers_set = []

        # app would be the equivalent of a Flask app, or other WSGI compatible application
        self.application = app

    @staticmethod
    def parse_request(text):
        request_line = text.splitlines()[0]
        request_line = request_line.rstrip('\r\n')
        return request_line.split()

    def get_environ(self, request_data, request_method, path):
        env = {}
        # TODO: Ensure this follows PEP8 conventions

        env['wsgi.version'] = (1, 0)
        env['wsgi.url_scheme'] = 'http'
        env['wsgi.input'] = io.StringIO(request_data)
        env['wsgi.errors'] = sys.stderr
        env['wsgi.multithread'] = False
        env['wsgi.multiprocess'] = False
        env['wsgi.run_once'] = False
        env['REQUEST_METHOD'] = request_method
        env['PATH_INFO'] = path
        env['SERVER_NAME'] = self.server_name
        env['SERVER_PORT'] = str(self.server_port)
        return env

    def start_response(self, status, response_headers):
        server_headers = [
            ('Date', datetime.now()),
            ('Server', 'WSGIServer 0.2'),
        ]
        self.headers_set = [status, response_headers + server_headers]
        # TODO: To adhere to WSGI specification the start_response must return
        # a 'write' callable.

    def finish_response(self, result, conn):
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
