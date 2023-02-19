from typing import TYPE_CHECKING

from google.protobuf.message import Message   # type: ignore

if TYPE_CHECKING:
    class BundleBuilder(Message): pass
    class SyncMessage(Message): pass
    class ChangeBuilder(Message): pass
    class EntryBuilder(Message): pass
    class ValueBuilder(Message): pass
    class KeyBuilder(Message): pass
    class ContainerBuilder(Message): pass
    class MovementBuilder(Message): pass
    class ClearanceBuilder(Message): pass
    class MuidBuilder(Message): pass
    class LogFile(Message): pass
else:
    from ..builders.bundle_pb2 import Bundle
    from ..builders.sync_message_pb2 import SyncMessage
    from ..builders.change_pb2 import Change as ChangeBuilder
    from ..builders.entry_pb2 import Entry as EntryBuilder
    from ..builders.value_pb2 import Value as ValueBuilder
    from ..builders.key_pb2 import Key as KeyBuilder
    from ..builders.behavior_pb2 import Behavior
    from ..builders.container_pb2 import Container as ContainerBuilder
    from ..builders.bundle_pb2 import Bundle as BundleBuilder
    from ..builders.movement_pb2 import Movement as MovementBuilder
    from ..builders.clearance_pb2 import Clearance as ClearanceBuilder
    from ..builders.muid_pb2 import Muid as MuidBuilder
