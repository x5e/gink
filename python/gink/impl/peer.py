from typing import Optional
from websockets.protocol import WebSocketCommonProtocol
from google.protobuf.message import Message as MessageBuilder

from ..builders.sync_message_pb2 import SyncMessage as SyncMessageBuilder

from .chain_tracker import ChainTracker
from .bundle_info import BundleInfo

class Peer:
    """ Holds a connection to another gink database and tracks what data the peer has.

        When the connection is established, we don't know how far along each chain
        the peer has.  It's only after we receive a greeting message that we can
        reason about the data that this peer has.

        Once we get a greeting object from the peer, we immediately send everything
        that this database has that the peer is missing.  This is essentially done
        atomically so we can assume after that that the peer has been *sent* everything
        this database has, though we don't know what they've actually received and 
        processed until we get acknowledgements corresponding to those bundles.
        The tracker object keeps track of what we know the peer has received and processed:
        that it, those bundles that it says that it has in its greeting message, those
        bundles that it has sent to us, and those bundles it's acknowledged receving.

    """

    def __init__(self, websocket: WebSocketCommonProtocol, peer_info=None):
        self.websocket = websocket
        self.tracker: Optional[ChainTracker] = None
        self.peer_info = peer_info

    async def send_if_needed(self, bundle: bytes, info: BundleInfo):
        if self.tracker is None:
            # wait until the peer tells us what they have before starting to send bundles
            return

        if not self.tracker.has(info):
            sync_message_builder = SyncMessageBuilder()
            sync_message_builder.commit = bundle # type: ignore
            assert isinstance(sync_message_builder, MessageBuilder)
            serialized: bytes = sync_message_builder.SerializeToString()
            return self.websocket.send(serialized)
    
