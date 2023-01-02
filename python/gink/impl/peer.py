from typing import Optional
from websockets.protocol import WebSocketCommonProtocol
from google.protobuf.message import Message as MessageBuilder

from ..builders.sync_message_pb2 import SyncMessage as SyncMessageBuilder

from .chain_tracker import ChainTracker
from .bundle_info import BundleInfo

class Peer:
    """ Holds a connection to another gink database along with data about what it has. """

    def __init__(self, websocket: WebSocketCommonProtocol, peer_info=None):
        self._websocket = websocket
        self._know_peer_has: Optional[ChainTracker] = None
        self._peer_info = peer_info

    async def send_if_needed(self, bundle: bytes, info: BundleInfo):
        if self._know_peer_has is None:
            # wait until the peer tells us what they have before starting to send bundles
            return

        if not self._know_peer_has.has(info):
            sync_message_builder = SyncMessageBuilder()
            sync_message_builder.commit = bundle # type: ignore
            assert isinstance(sync_message_builder, MessageBuilder)
            serialized: bytes = sync_message_builder.SerializeToString()
            return self._websocket.send(serialized)
    
    async def send_greeting(self, chain_tracker: ChainTracker):
        assert chain_tracker
        raise NotImplementedError()
