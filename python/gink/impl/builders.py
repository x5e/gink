from __future__ import annotations
from typing import TYPE_CHECKING, List

from google.protobuf.message import Message  # type: ignore
from enum import IntEnum

from .typedefs import Medallion, MuTimestamp

if TYPE_CHECKING:

    class HeaderBuilder(Message):
        timestamp: int
        medallion: int
        previous: int
        comment: str
        chain_start: int


    class ChangeBuilder(Message):
        entry: EntryBuilder
        container: ContainerBuilder
        movement: MovementBuilder


    class BundleBuilder(Message):
        header: HeaderBuilder
        changes: List[ChangeBuilder]


    class SyncMessage(Message):
        bundle: bytes


    class Pair:
        left: MuidBuilder
        rite: MuidBuilder


    class EntryBuilder(Message):
        describing: MuidBuilder
        pointee: MuidBuilder
        behavior: int
        value: ValueBuilder
        container: MuidBuilder
        deletion: bool
        purge: bool
        pair: Pair
        octets: bytes
        key: KeyBuilder
        effective: int

    class ValueBuilder(Message):
        pass

    class KeyBuilder(Message):
        pass

    class ContainerBuilder(Message):
        behavior: int

    class MovementBuilder(Message):
        container: MuidBuilder
        entry: MuidBuilder
        dest: int
        purge: bool

    class ClearanceBuilder(Message):
        pass

    class MuidBuilder(Message):
        timestamp: MuTimestamp
        medallion: Medallion
        offset: int

    class ClaimBuilder(Message):
        medallion: Medallion
        chain_start: MuTimestamp
        process_id: int
        claim_time: MuTimestamp

    class LogFileBuilder(Message):
        bundles: List[bytes]
        claims: List[ClaimBuilder]

    class Behavior(IntEnum):
        UNSPECIFIED = 0
        BOX = 1
        SEQUENCE = 2
        PAIR_MAP = 3
        DIRECTORY = 4
        KEY_SET = 5
        GROUP = 6
        VERTEX = 7
        PAIR_SET = 8
        EVENT_TYPE = 9
        PROPERTY = 10
        EDGE_TYPE = 11
        TABLE = 12
        BRAID = 13
else:
    from ..builders.bundle_pb2 import Bundle as BundleBuilder
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
    from ..builders.behavior_pb2 import Behavior
    from ..builders.log_file_pb2 import LogFile as LogFileBuilder
    from ..builders.claim_pb2 import Claim as ClaimBuilder
    from ..builders.header_pb2 import Header as HeaderBuilder
