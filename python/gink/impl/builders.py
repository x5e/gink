from typing import TYPE_CHECKING, List, Iterator, Tuple, Iterable

from google.protobuf.message import Message  # type: ignore
from enum import IntEnum


if TYPE_CHECKING:

    class ChangeBuilder(Message):
        entry: 'EntryBuilder'
        container: 'ContainerBuilder'
        movement: 'MovementBuilder'
        clearance: 'ClearanceBuilder'

    class BundleBuilder(Message):
        identity: str
        changes: List[ChangeBuilder]
        verify_key: bytes
        timestamp: int
        chain_start: int
        medallion: int
        previous: int
        prior_hash: bytes
        key_id: int
        encrypted: bytes
        comment: str

    class SyncMessage(Message):
        bundle: bytes
        signal: 'SyncMessage.Signal'

        class Signal:
            type: 'SyncMessage.Signal.SignalType'

            class SignalType(IntEnum):
                INITIAL_BUNDLES_SENT = 1
                READ_ONLY_CONNECTION = 2

    class Pair:
        left: 'MuidBuilder'
        rite: 'MuidBuilder'

    class EntryBuilder(Message):
        describing: 'MuidBuilder'
        pointee: 'MuidBuilder'
        behavior: int
        value: 'ValueBuilder'
        container: 'MuidBuilder'
        deletion: bool
        purge: bool
        pair: Pair
        octets: bytes
        key: 'KeyBuilder'
        effective: int

    class ValueBuilder(Message):
        integer: str
        characters: str
        octets: bytes
        special: 'ValueBuilder.Special'
        floating: float
        timestamp: int
        document: 'ValueBuilder.Document'
        tuple: 'ValueBuilder.Tuple'

        class Tuple:
            values: List['ValueBuilder']

        class Document:
            keys: List['KeyBuilder']
            values: List['ValueBuilder']

        class Special(IntEnum):
            NULL = 0
            TRUE = 1
            FALSE = 2

    class KeyBuilder(Message):
        characters: str
        number: int
        octets: bytes

    class ContainerBuilder(Message):
        behavior: int

    class MovementBuilder(Message):
        container: 'MuidBuilder'
        entry: 'MuidBuilder'
        dest: int
        purge: bool

    class ClearanceBuilder(Message):
        pass

    class MuidBuilder(Message):
        timestamp: int
        medallion: int
        offset: int

    class ClaimBuilder(Message):
        medallion: int
        chain_start: int
        process_id: int
        claim_time: int

    class KeyPairBuilder(Message):
        public_key: bytes
        secret_key: bytes

    class LogFileBuilder(Message):
        bundles: List[bytes]
        claims: List[ClaimBuilder]
        key_pairs: List[KeyPairBuilder]
        magic_number: int

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
        ACCUMULATOR = 14

        @staticmethod
        def items() -> Iterator[Tuple[str, int]]:
            raise Exception("for type checking purposes only")
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
    from ..builders.key_pair_pb2 import KeyPair as KeyPairBuilder
