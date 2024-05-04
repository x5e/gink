import socket
import errno
import io
import sys

from select import select
from datetime import datetime

class WSGIServer(object):
    address_family = socket.AF_INET
    socket_type = socket.SOCK_STREAM
    request_queue_size = 1024

    def __init__(self, address, port=8081):
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

    def set_app(self, application):
        self.application = application

    def serve_forever(self):
        rlist, wlist, elist = [self.listen_socket], [], []

        while True:
            readables, writables, exceptions = select(rlist, wlist, elist)
            for sock in readables:
                if sock is self.listen_socket:
                    try:
                        conn, client_address = self.listen_socket.accept()
                    except IOError as e:
                        code, msg = e.args
                        if code == errno.EINTR:
                            continue
                        else:
                            raise
                    rlist.append(conn)
                else:
                    try:
                        request_data = sock.recv(1024)
                    except ConnectionResetError as e:
                        request_data = None
                    if not request_data:
                        sock.close()
                        rlist.remove(sock)
                    else:
                        request_data = request_data.decode('utf-8')
                        print(''.join(
                            f'< {line}\n' for line in request_data.splitlines()
                        ))
                        # parse request
                        (request_method, path, request_version) = self.parse_request(request_data)
                        env = self.get_environ(
                            request_data, request_method, path
                        )
                        result = self.application(env, self.start_response)
                        self.finish_response(result, sock)

    @classmethod
    def parse_request(cls, text):
        request_line = text.splitlines()[0]
        request_line = request_line.rstrip('\r\n')
        return request_line.split()

    def get_environ(self, request_data, request_method, path):
        env = {}
        # TODO: Ensure this follows PEP8 conventions

        # Required WSGI variables
        env['wsgi.version'] = (1, 0)
        env['wsgi.url_scheme'] = 'http'
        env['wsgi.input'] = io.StringIO(request_data)
        env['wsgi.errors'] = sys.stderr
        env['wsgi.multithread'] = False
        env['wsgi.multiprocess'] = False
        env['wsgi.run_once'] = False
        # Required CGI variables
        env['REQUEST_METHOD'] = request_method
        env['PATH_INFO'] = path
        env['SERVER_NAME'] = self.server_name
        env['SERVER_PORT'] = str(self.server_port)
        return env

    def start_response(self, status, response_headers, exc_info=None):
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
