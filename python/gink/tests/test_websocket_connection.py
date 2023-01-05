""" tests to make sure that websocket connection works as intended """
import logging
from socket import socketpair
from ..impl.websocket_connection import WebsocketConnection

logging.basicConfig(level=logging.DEBUG)

def test_chit_chat():
    """ ensures that I can send and receive data via a websocket connection """
    server_socket, client_socket = socketpair()

    # creating a client connection implicitly sends a request
    server = WebsocketConnection(socket=server_socket)
    client = WebsocketConnection(socket=client_socket, force_to_be_client=True)

    # force the server to receive the initial request and send a response
    for incoming in server.receive():
        raise Exception("didn't expect any user messages")

    # force the client to process the connection accepted message
    for incoming in client.receive():
        raise Exception("Didn't expect any user messages!")

    for message in ["Hello, World!", b"\x01\x00\x255"]:
        server.send(message)
        for incoming in client.receive():
            assert incoming == message, incoming

    for message in ["Hello, World!", b"\x01\x00\x255"]:
        client.send(message)
        for incoming in server.receive():
            assert incoming == message, incoming

    getattr(client, "_logger").setLevel(logging.ERROR)
    client.close()
    for msg in server.receive():
        print("msg=", msg)

    assert client.is_closed() and server.is_closed()




if __name__ == "__main__":
    test_chit_chat()
