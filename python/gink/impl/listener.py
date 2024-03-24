""" contains the Listener class that listens on a port for incomming connections """
from socket import (
    socket as Socket,
    AF_INET,
    SOCK_STREAM,
    SOL_SOCKET,
    SO_REUSEADDR,
)

from .builders import SyncMessage

from .connection import Connection
from .websocket_connection import WebsocketConnection

import os.path
import json

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow


class Listener:
    """ Listens on a port for incoming connections. """

    def __init__(self, connection_class=WebsocketConnection, ip_addr: str = "", port: int = 8080, oauth=False):
        self.connection_class = connection_class
        self.socket = Socket(AF_INET, SOCK_STREAM)
        self.socket.setsockopt(SOL_SOCKET, SO_REUSEADDR, 1)
        self.socket.bind((ip_addr, int(port)))
        self.socket.listen(128)
        if oauth:
            self.OAUTH_CREDS = os.environ.get("OAUTH_CREDS")
            assert self.OAUTH_CREDS, "Provide OAUTH_CREDS env variable to use OAuth 2.0"
            self.OAUTH_CREDS = json.loads(self.OAUTH_CREDS)

    def fileno(self):
        """ Gives the file descriptor for use in socket.select and similar. """
        return self.socket.fileno()

    def accept(self, greeting: SyncMessage) -> Connection:
        """ Method to call when the underlying socket is "ready". """
        if self.OAUTH_CREDS:
            os.environ['OAUTHLIB_RELAX_TOKEN_SCOPE'] = '1'
            SCOPES = ["https://www.googleapis.com/auth/userinfo.email"]
            creds = None
            # The file token.json stores the user's access and refresh tokens, and is
            # created automatically when the authorization flow completes for the first
            # time.
            if os.path.exists("token.json"):
                creds = Credentials.from_authorized_user_file("token.json", SCOPES)
            # If there are no (valid) credentials available, let the user log in.
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                else:
                    flow = InstalledAppFlow.from_client_config(
                        self.OAUTH_CREDS, SCOPES
                    )
                    creds = flow.run_local_server(port=8089)
                # Save the credentials for the next run
                with open("token.json", "w") as token:
                    token.write(creds.to_json())

        (new_socket, addr) = self.socket.accept()
        peer: Connection = self.connection_class(
            socket=new_socket,
            host=addr[0],
            port=addr[1],
            greeting=greeting)
        return peer
