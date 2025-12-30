""" tests to make sure that websocket connection works as intended """
from logging import getLogger, DEBUG, ERROR
from socket import socketpair

# builders
from ..impl.builders import SyncMessage
from google.protobuf.text_format import Parse  # type: ignore

from ..impl.connection import Connection, Finished
from ..impl.utilities import make_auth_func
from ..impl.looping import loop


# basicConfig(level=DEBUG)
_logger = getLogger(__name__)


def test_chit_chat():
    """ ensures that I can send and receive data via a websocket connection """
    server_socket, client_socket = socketpair()
    signals = [
        SyncMessage.Signal.INITIAL_BUNDLES_SENT,
        SyncMessage.Signal.READ_ONLY_CONNECTION,
    ]

    # creating a client connection implicitly sends a request
    server = Connection(socket=server_socket)
    client = Connection(socket=client_socket, is_client=True)
    # getattr(client, "_logger").setLevel(ERROR)

    # force the server to receive the initial request and send a response
    for incoming in server.receive():
        if incoming.signal.type in signals:
            continue
        raise Exception("didn't expect any user messages")

    # force the client to process the connection accepted message
    for incoming in client.receive():
        if hasattr(incoming, "signal") and incoming.signal in signals:
            continue
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

    def on_ws_act(connection: Connection) -> None:
        for thing in connection.receive_objects():
            _logger.debug(f"default_wbsc_func got {thing}")

    """ tests authentication """
    for correct in [False, True]:
        server_socket, client_socket = socketpair()
        token = "ABCXYZ123"
        auth_func = make_auth_func(token)
        # creating a client connection implicitly sends a request
        server = Connection(
            socket=server_socket,
            auth_func=auth_func,
            on_ws_act=on_ws_act,
        )

        if correct:
            auth_data = f"Token {token}"
        else:
            auth_data = f"Token WRONG"

        client = Connection(
            socket=client_socket, is_client=True, auth_data=auth_data, on_ws_act=on_ws_act
        )
        getattr(client, "_logger").setLevel(ERROR)

        if correct:
            loop(server, client, until=.010)
            assert client.is_alive(), "client not alive"
            assert server.is_alive(), "server not alive"
        if not correct:
            loop(server, client, until=.010)
            assert (not client.is_alive()) and (not server.is_alive()), "expected both closed"

        try:
            server_socket.close()
            client_socket.close()
        except:
            pass

if __name__ == "__main__":
    test_chit_chat()
