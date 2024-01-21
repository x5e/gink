""" tests to make sure that websocket connection works as intended """
import logging
from socket import socketpair

import os

# builders
from ..impl.builders import SyncMessage, Parse

from ..impl.websocket_connection import WebsocketConnection

logging.basicConfig(level=logging.DEBUG)


def test_chit_chat():
    """ ensures that I can send and receive data via a websocket connection """
    server_socket, client_socket = socketpair()

    # creating a client connection implicitly sends a request
    server = WebsocketConnection(socket=server_socket)
    client = WebsocketConnection(socket=client_socket, force_to_be_client=True)
    getattr(client, "_logger").setLevel(logging.ERROR)

    # force the server to receive the initial request and send a response
    for incoming in server.receive():
        raise Exception("didn't expect any user messages")

    # force the client to process the connection accepted message
    for incoming in client.receive():
        raise Exception("Didn't expect any user messages!")

    sync_message = SyncMessage()
    # pylint: disable=maybe-no-member
    sync_message.ack.medallion = 1  # type: ignore
    sync_message.ack.timestamp = 2  # type: ignore
    sync_message.ack.chain_start = 3  # type: ignore

    # example of to string and back
    sync_message2 = SyncMessage()
    sync_message2 = Parse(str(sync_message), sync_message2)
    assert sync_message2 == sync_message

    for message in [sync_message]:
        server.send(message)
        for incoming in client.receive():
            assert incoming == message, incoming

    for message in [sync_message]:
        client.send(message)
        for incoming in server.receive():
            assert incoming == message, incoming

    client.close()
    for _ in server.receive():
        raise Exception("not expected")

    assert client.is_closed() and server.is_closed()

def test_auth():
    """ tests authentication """
    server_socket, client_socket = socketpair()

    os.environ["GINK_AUTH_TOKEN"] = "Token    kjnakjnfakjnfakjnwadhbhbadab"
    # creating a client connection implicitly sends a request
    server = WebsocketConnection(socket=server_socket)

    os.environ["GINK_AUTH_TOKEN"] = "Token WRONGAUTHTOKENDONTLETTHROUGH"

    client = WebsocketConnection(socket=client_socket, force_to_be_client=True)
    getattr(client, "_logger").setLevel(logging.ERROR)

    let_auth_through = False
    try:
        # force the server to receive the initial request and send a response
        for _ in server.receive():
            pass
        # The above should error when the connection gets rejected,
        # so let_auth_through should remain false.
        let_auth_through = True
    except:
        pass
    assert not let_auth_through, "Server let bad auth token through"

if __name__ == "__main__":
    test_chit_chat()
