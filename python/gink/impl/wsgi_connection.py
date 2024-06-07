""" One connection to a WsgiListener """
from socket import socket as Socket
from io import StringIO
from sys import stderr
from datetime import datetime
from typing import Iterable, Optional, Dict, Any, List
from logging import getLogger

from .looping import Selectable, Finished


class WsgiConnection(Selectable):

    def __init__(self, app, socket: Socket, server_name: str, server_port: int):
        self._app = app
        self._socket = socket
        self._fd = socket.fileno()
        self._logger = getLogger(self.__class__.__name__)
        self._server_name = server_name
        self._server_port = server_port
        self._response_headers: Optional[List[tuple]] = None
        self._status: Optional[str] = None
        self._response_started = False

    def fileno(self):
        return self._fd

    def close(self):
        self._socket.close()

    def on_ready(self) -> None:
        try:
            request_data = self._socket.recv(1024)
        except ConnectionResetError:
            raise Finished()
        decoded = request_data.decode('utf-8')
        lines = decoded.splitlines()
        if self._logger:
            self._logger.debug(''.join(f'< {line}\n' for line in lines))
        (request_method, path, _) = lines[0].split(maxsplit=3)
        env = self._get_environ(decoded, request_method, path)
        result: Iterable[bytes] = self._app(env, self._start_response)
        for data in result:
            if data:
                self._write(data)
        if not self._response_started:
            self._write(b"")
        raise Finished()  # will cause the loop to call close after deregistering

    def _get_environ(self, request_data, request_method, path) -> Dict[str, Any]:
        return {
            'wsgi.version': (1, 0),
            'wsgi.url_scheme': 'http',
            'wsgi.input': StringIO(request_data),
            'wsgi.errors': stderr,
            'wsgi.multithread': False,
            'wsgi.multiprocess': False,
            'wsgi.run_once': False,
            'REQUEST_METHOD': request_method,
            'PATH_INFO': path,
            'SERVER_NAME': self._server_name,
            'SERVER_PORT': str(self._server_port),
        }

    def _start_response(self, status: str, response_headers: List[tuple], exc_info: Optional[tuple] = None):
        server_headers: List[tuple] = [
            ('Date', datetime.now()),
            ('Server', 'WSGIServer 0.2'),
        ]
        if exc_info and self._response_started:
            raise exc_info[1].with_traceback(exc_info[2])
        self._status = status
        self._response_headers = response_headers + server_headers
        return self._write

    def _write(self, blob: bytes):
        if self._status is None:
            raise ValueError("write before start_response")
        if not self._response_started:
            response = f'HTTP/1.0 {self._status}\r\n'
            assert self._response_headers is not None
            for header in self._response_headers:
                response += '{0}: {1}\r\n'.format(*header)
            response += '\r\n'
            self._socket.sendall(response.encode())
            self._response_started = True
        self._socket.sendall(blob)
