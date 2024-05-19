""" One connection to a WsgiListener """
from socket import socket as Socket
from io import StringIO
from sys import stderr
from datetime import datetime
from typing import Iterable, Optional, Dict, Any

class WsgiConnection(object):
    def __init__(self, socket: Socket):
        self.sock = socket
        self.fd = socket.fileno()

    def fileno(self):
        return self.fd

    def close(self):
        self.sock.close()

    def sendall(self, data: bytes):
        self.sock.sendall(data)

    def receive_data(self):
        try:
            request_data = self.sock.recv(1024)
        except ConnectionResetError as e:
            request_data = None
        return request_data


    def get_environ(self, request_data, request_method, path) -> Dict[str, Any]:
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
            'SERVER_NAME': self._server_name,
            'SERVER_PORT': str(self._server_port)
        }

    def start_response(self, status, response_headers, exc_info: Optional[tuple]=None):
        server_headers = [
            ('Date', datetime.now()),
            ('Server', 'WSGIServer 0.2'),
        ]

        # If headers have already been sent
        if exc_info and self._headers_set:
            raise exc_info[1].with_traceback(exc_info[2])

        self._headers_set = [status, response_headers + server_headers]

        return self.write

    def write(self, _: str):
            raise NotImplementedError("Using the write callable has not been implemented.")

    def finish_response(self, result: Iterable[bytes], conn: WsgiConnection):
        status, response_headers = self._headers_set
        response = f'HTTP/1.0 {status}\r\n'
        for header in response_headers:
            response += '{0}: {1}\r\n'.format(*header)
        response += '\r\n'
        for data in result:
            if isinstance(data, bytes):
                response += data.decode('utf-8')
            else:
                response += data
        if self._logger:
            self._logger.debug(f'HTTP/1.0 {status}')
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
        lines = decoded.splitlines()
        if self._logger:
            self._logger.debug(''.join(f'< {line}\n' for line in lines))
        (request_method, path, _) = lines[0].split(maxsplit=3)
        env = self.get_environ(decoded, request_method, path)
        result = self._app(env, self.start_response)
        return result
