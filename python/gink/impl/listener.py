from typing import Union
from socket import (
    socket as Socket,
    AF_INET,
    SOCK_STREAM,
    SOL_SOCKET,
    SO_REUSEADDR,
)

from .peer import Peer

class Listener:

    def __init__(self, peer_class, ip="", port: Union[int, str]=8080):
        self.peer_class = peer_class
        self.socket = Socket(AF_INET, SOCK_STREAM)
        self.socket.setsockopt(SOL_SOCKET, SO_REUSEADDR, 1)
        self.socket.bind((ip, int(port)))
        self.socket.listen(128)

    def fileno(self):
        return self.socket.fileno()
    
    def accept(self) -> Peer:
        (new_socket, addr) = self.socket.accept()
        peer: Peer = self.peer_class(new_socket, addr)
        return peer
