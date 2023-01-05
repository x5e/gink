""" tests to make sure teh WsPeer client works as intended """
from socket import socketpair
from ..impl.wspeer import WsPeer

def test_chit_chat():
    """ ensures that I can send and receive data via a websocket connection """
    server_socket, client_socket = socketpair()
    server = WsPeer(socket=server_socket)
    client = WsPeer(socket=client_socket, is_client=True)
    for message in ["Hello, World!", b"\x01\x00\x255"]:
        client.send(message)
        for incoming in server.receive():
            assert incoming == message, incoming
