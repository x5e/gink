""" One connection to a WsgiListener """
from socket import socket as Socket

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
