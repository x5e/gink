""" tests to make sure that websocket connection works as intended """
import logging
from socket import socketpair

# builders
from ..impl.builders import SyncMessage
from google.protobuf.text_format import Parse  # type: ignore

from ..impl.connection import Connection, Finished
from ..impl.utilities import make_auth_func
from ..impl.looping import loop

logging.basicConfig(level=logging.DEBUG)


def test_chit_chat():
    """ ensures that I can send and receive data via a websocket connection """
    server_socket, client_socket = socketpair()

    # creating a client connection implicitly sends a request
    server = Connection(socket=server_socket)
    client = Connection(socket=client_socket, is_client=True)
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
    try:
        for _ in server.receive():
            raise Exception("not expected")
    except Finished:
        server.close()

    assert client.is_closed() and server.is_closed()


def test_request():
    """ tests non-websocket request """

    server_socket, client_socket = socketpair()
    # creating a client connection implicitly sends a request
    def app(_, start_response):
        start_response('200 OK', [('Content-type', 'text/plain')])
        return [b'Hello world!\n']
    server = Connection(socket=server_socket, wsgi_func=app)
    client_socket.send(b"GET /foo/bar HTTP/1.0\r\nAccept: */*\r\n\r\n")
    loop(server, until=.010)
    received = client_socket.recv(4096)
    assert b"Hello" in received


def test_auth():
    """ tests authentication """
    for correct in [True, False]:
        server_socket, client_socket = socketpair()
        token = "ABCXYZ123"
        auth_func = make_auth_func(token)
        # creating a client connection implicitly sends a request
        server = Connection(socket=server_socket, auth_func=auth_func)
        server.on_ready = lambda: server.receive() and None

        if correct:
            auth_data = f"Token {token}"
        else:
            auth_data = "Token bad"

        client = Connection(
            socket=client_socket, is_client=True, auth_data=auth_data)
        client.on_ready = lambda: client.receive() and None
        getattr(client, "_logger").setLevel(logging.ERROR)

        if correct:
            loop(server, client, until=.010)
            assert client.is_alive()
            assert server.is_alive()
        else:
            let_auth_through = False
            try:
                # force the server to receive the initial request and send a response
                loop(server, client, until=.010)
                assert (not client.is_alive()) and (not server.is_alive())
                # The above should error when the connection gets rejected,
                # so let_auth_through should remain false.
                let_auth_through = True
            except:
                pass
            if let_auth_through:
                raise AssertionError("auth allowed when token was bad")

        try:
            server_socket.close()
            client_socket.close()
        except:
            pass

if __name__ == "__main__":
    test_chit_chat()
