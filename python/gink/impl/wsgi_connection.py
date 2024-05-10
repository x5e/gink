""" One connection to a WSGIListener """
from socket import socket as Socket
class WSGIConnection(Socket):
    def __init__(self, socket: Socket):
        self.sock = socket

    def receive_data(self):
        try:
            request_data = self.sock.recv(1024)
        except ConnectionResetError as e:
            request_data = None
        return request_data
