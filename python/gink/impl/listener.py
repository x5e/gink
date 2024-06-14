""" contains the Listener class that listens on a port for incomming connections """
from typing import Callable, Optional, Union
from socket import (
    socket as Socket,
    AF_INET,
    SOCK_STREAM,
    SOL_SOCKET,
    SO_REUSEADDR,
)
from os import environ
import ssl
from .typedefs import AuthFunc


class Listener(Socket):
    """ Listens on a port for incoming connections. """

    on_ready: Callable  # needs to be dynamically assigned

    def __init__(
            self,
            addr: str = "",
            port: int = 8080,
            auth: Optional[AuthFunc] = None
            ):
        Socket.__init__(self, AF_INET, SOCK_STREAM)
        self.setsockopt(SOL_SOCKET, SO_REUSEADDR, 1)
        self.bind((addr, int(port)))
        self.listen(128)
        self.certfile = environ.get("GINK_CERTFILE")
        self.keyfile = environ.get("GINK_KEYFILE")
        assert (self.certfile and self.keyfile) or (not self.certfile and not self.keyfile), "Need both cert and key files for SSL."
        if self.certfile and self.keyfile:
            print("server is secured using SSL")
        else:
            print("server is insecure")
        self._auth_func = auth

    def get_auth(self) -> Optional[AuthFunc]:
        return self._auth_func
