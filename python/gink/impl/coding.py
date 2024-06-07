""" Utility functions for encoding and decoding values, keys, and other binary data.

    Generally the things in this file are intended to help in the implementation, and
    not be visible to users of the Gink library.  They are *NOT* considered part of the
    public API and can change at any time without a corresponding increase in the major
    revision number.
"""
from __future__ import annotations
from typing import Optional, Union, NamedTuple, List, Any, Tuple
from struct import Struct

from .builders import EntryBuilder, ChangeBuilder, ValueBuilder, KeyBuilder, Message, Behavior
from .typedefs import UserKey, MuTimestamp, UserValue, Deletion, Inclusion
from .muid import Muid
from .bundle_info import BundleInfo

UNSPECIFIED: int = Behavior.UNSPECIFIED
SEQUENCE: int = Behavior.SEQUENCE
DIRECTORY: int = Behavior.DIRECTORY
PROPERTY: int = Behavior.PROPERTY
BOX: int = Behavior.BOX
VERTEX: int = Behavior.VERTEX
GROUP: int = Behavior.GROUP
EDGE_TYPE: int = Behavior.EDGE_TYPE
KEY_SET: int = Behavior.KEY_SET
PAIR_SET: int = Behavior.PAIR_SET
PAIR_MAP: int = Behavior.PAIR_MAP
TABLE: int = Behavior.TABLE
BRAID: int = Behavior.BRAID
FLOAT_INF = float("inf")
INT_INF = 0xffffffffffffffff
ZERO_64: bytes = b"\x00" * 8
KEY_MAX: int = 2**53 - 1
deletion = Deletion()
inclusion = Inclusion()


def new_entries_replace(behavior: int) -> bool:
    return behavior in (BOX, PAIR_MAP, DIRECTORY, KEY_SET, GROUP, PAIR_SET, PROPERTY, TABLE, BRAID)


def normalize_entry_builder(entry_builder: EntryBuilder, entry_muid: Muid):
    """ Make all relative muid references absolute muid refereces within an entry.
    """
    container_muid = Muid.create(context=entry_muid, builder=entry_builder.container)
    container_muid.put_into(entry_builder.container)

    if entry_builder.HasField("describing"):
        describes_muid = Muid.create(context=entry_muid, builder=entry_builder.describing)
        describes_muid.put_into(entry_builder.describing)

    if entry_builder.HasField("pointee"):
        pointee_muid = Muid.create(context=entry_muid, builder=entry_builder.pointee)
        pointee_muid.put_into(entry_builder.pointee)

    if entry_builder.HasField("pair"):
        left_muid = Muid.create(context=entry_muid, builder=entry_builder.pair.left)
        left_muid.put_into(entry_builder.pair.left)
        rite_muid = Muid.create(context=entry_muid, builder=entry_builder.pair.rite)
        rite_muid.put_into(entry_builder.pair.rite)


def ensure_entry_is_valid(builder: EntryBuilder, context: Any = object(), offset: Optional[int]=None):
    if getattr(builder, "behavior") == UNSPECIFIED:
        raise ValueError("entry lacks a behavior")
    if not builder.HasField("container"):
        raise ValueError("no container specified in entry")
    entry_muid = Muid.create(context, offset=offset)
    container_muid = Muid.create(context=entry_muid, builder=getattr(builder, "container"))
    if container_muid.timestamp == -1 and container_muid.medallion > 0:
        if getattr(context, "medallion") != container_muid.medallion:
            raise ValueError("attempt to modify instance container from other instance")


def serialize(thing) -> bytes:
    """ Converts a protobuf builder or a timestamp into binary data. """
    if isinstance(thing, Message):
        return thing.SerializeToString()
    if thing is None or isinstance(thing, (int, float)):
        return encode_muts(thing)
    return bytes(thing)


class LocationKey(NamedTuple):
    """ Key used in the locations table to track the current location of entries. """
    entry_muid: Muid
    placement: Muid

    @staticmethod
    def from_bytes(data: bytes):
        """ inverse of __bytes__ """
        return LocationKey(Muid.from_bytes(data[0:16]), Muid.from_bytes(data[16:32]))

    def __bytes__(self):
        return bytes(self.entry_muid) + bytes(self.placement)


class RemovalKey(NamedTuple):
    """ Key used in the removals table to track soft-deletes of entries. """
    container: Muid
    removing: Muid  # the entry or movement that placed the entry to be (re)moved
    movement: Muid  # the muid of the encoded movement

    @staticmethod
    def from_bytes(data: bytes):
        """ inverse of __bytes__ """
        return RemovalKey(
            Muid.from_bytes(data[0:16]),
            Muid.from_bytes(data[24:40]),
            Muid.from_bytes(data[40:]))

    def __bytes__(self) -> bytes:
        return bytes(self.container) + bytes(self.removing) + bytes(self.movement)


class QueueMiddleKey(NamedTuple):
    """ Used to order non-keyed entries by timestamp and modification change. """
    effective_time: MuTimestamp

    def __bytes__(self):
        return encode_muts(self.effective_time)

    @staticmethod
    def from_bytes(data: bytes):
        """ inverse of __bytes__ """
        effective_time = decode_muts(data[0:8])
        assert effective_time is not None
        if len(data) == 8:
            return QueueMiddleKey(effective_time)
        else:
            raise AssertionError("expected QueueMiddleKey to be 8 bytes")


class Placement(NamedTuple):
    """ just a class to serialize / deserialize keys used to store entries

    """
    container: Muid
    middle: Union[UserKey, QueueMiddleKey, Muid, None, Tuple[Muid, Muid]]
    placer: Muid
    expiry: Optional[MuTimestamp]

    def get_positioner(self) -> Muid:
        return self.placer

    def get_queue_position(self) -> MuTimestamp:
        """ Pulls out the effective timestamp (ordering position) from the middle_key. """
        assert isinstance(self.middle, QueueMiddleKey)
        return self.middle.effective_time

    def get_key(self) -> Union[UserKey, Muid, None, Tuple[Muid, Muid]]:
        assert not isinstance(self.middle, QueueMiddleKey)
        return self.middle


    @staticmethod
    def from_builder(builder: EntryBuilder, new_info: BundleInfo, offset: int):
        """ Create an EntryStorageKey from an Entry itself, plus address information. """
        entry_muid = Muid.create(context=new_info, offset=offset)
        container = Muid.create(builder=getattr(builder, "container"), context=entry_muid)
        behavior = getattr(builder, "behavior")
        position = getattr(builder, "effective")
        middle_key: Union[QueueMiddleKey, Muid, UserKey, None, Tuple[Muid, Muid]]
        if behavior in [DIRECTORY, KEY_SET]:
            middle_key = decode_key(builder)
        elif behavior in (BOX, VERTEX):
            middle_key = None
        elif behavior in (SEQUENCE, EDGE_TYPE):
            middle_key = QueueMiddleKey(position or entry_muid.timestamp)
        elif behavior in (PROPERTY, GROUP, BRAID):
            middle_key = Muid.create(context=entry_muid, builder=builder.describing)
        elif behavior in (PAIR_SET, PAIR_MAP):
            left = Muid.create(context=entry_muid, builder=builder.pair.left)
            rite = Muid.create(context=entry_muid, builder=builder.pair.rite)
            middle_key = (left, rite)
        else:
            raise ValueError(f"unexpected behavior: {behavior}")
        expiry = getattr(builder, "expiry") or None
        return Placement(container, middle_key, entry_muid, expiry)

    @staticmethod
    def from_bytes(data: bytes, using: Union[int, bytes, EntryBuilder]=DIRECTORY):
        """ creates an entry key from its binary format, using either the entry(bytes) or behavior
        """
        # pylint: disable=maybe-no-member
        if isinstance(using, bytes):
            using = EntryBuilder.FromString(using)
        if isinstance(using, EntryBuilder):
            using = using.behavior
        if not isinstance(using, int):
            raise ValueError(f"can't determine behavior from {str(using)}")
        container_bytes = data[0:16]
        middle_key_bytes = data[16:-24]
        entry_muid_bytes = data[-24:-8]
        expiry_bytes = data[-8:]
        entry_muid = Muid.from_bytes(entry_muid_bytes)
        middle_key: Union[QueueMiddleKey, MuTimestamp,  UserKey, Muid, None, Tuple[Muid, Muid]]
        if using in [DIRECTORY, KEY_SET]:
            middle_key = decode_key(middle_key_bytes)
        elif using == SEQUENCE:
            middle_key = QueueMiddleKey.from_bytes(middle_key_bytes)
        elif using in (PROPERTY, GROUP, BRAID):
            middle_key = Muid.from_bytes(middle_key_bytes)
        elif using in (PAIR_SET, PAIR_MAP):
            middle_key = (Muid.from_bytes(middle_key_bytes[:16]), Muid.from_bytes(middle_key_bytes[16:]))
        elif using in (BOX, VERTEX, EDGE_TYPE):
            middle_key = None
        else:
            raise ValueError(f"unexpected behavior {using}")
        return Placement(
            container=Muid.from_bytes(container_bytes),
            middle=middle_key,
            placer=entry_muid,
            expiry=decode_muts(expiry_bytes))

    def replace_time(self, timestamp: int):
        """ create a entry key that can be used for seeking before the given time """
        return Placement(self.container, self.middle, Muid(timestamp, 0, 0, ), None)

    def __bytes__(self) -> bytes:
        parts: List[Any] = [self.container]
        if isinstance(self.middle, (QueueMiddleKey, Muid)):
            parts.append(self.middle)
        elif isinstance(self.middle, (int, str, bytes)):
            parts.append(encode_key(self.middle))
        elif isinstance(self.middle, tuple):
            assert len(self.middle) == 2
            if not isinstance(self.middle[0], Muid) and not isinstance(self.middle[1], Muid): # type: ignore
                # If self.middle is a container (a vertex)/not a muid
                assert not isinstance(self.middle[0], int)
                parts.append(self.middle[0]._muid)
                parts.append(self.middle[1]._muid)
            else:
                assert isinstance(self.middle[0], Muid) and isinstance(self.middle[1], Muid)
                parts.append(self.middle[0])
                parts.append(self.middle[1])
        parts.append(self.placer)
        parts.append(self.expiry)
        return b"".join(map(serialize, parts))

    def get_placed_time(self) -> MuTimestamp:
        """ Gets the time that a specific entry key was inserted into the database.

            This is a little weird because queue entries are sorted by time by default,
            but that time can overridden by explicity encoding a position.  But even
            though we know now where we want the entry to be, we still need to know
            when it was placed there in order to let users ask what the order previously was.
        """
        return self.get_positioner().timestamp

    def __lt__(self, other):
        # I'm override sort here because I want the same sort order of the binary representation,
        # which will be a little different because of flipping the entry muids.
        # Also, sorting would break because keys can be either ints or strings
        return bytes(self) < bytes(other)


class PlacementBuilderPair(NamedTuple):
    """ Parsed entry data. """
    placement: Placement
    builder: EntryBuilder


def create_deleting_entry(muid: Muid, key: Union[UserKey, None, Muid, Tuple[Muid, Muid]], behavior: int) -> EntryBuilder:
    """ creates an entry that will delete the given key from the container

        I'm allowing a null key in the argument then barfing if it's null
        inside in part because it results in an easier to use API.
    """
    # pylint: disable=maybe-no-member
    entry_builder = EntryBuilder()
    entry_builder.behavior = behavior
    muid.put_into(entry_builder.container)
    entry_builder.deletion = True
    if behavior in (DIRECTORY, KEY_SET):
        assert isinstance(key, (int, str, bytes))
        encode_key(key, entry_builder.key)
    elif behavior == BOX:
        assert key is None
    elif behavior in (PROPERTY, GROUP):
        assert isinstance(key, Muid)
        key.put_into(entry_builder.describing)
    elif behavior in (PAIR_SET, PAIR_MAP):
        assert isinstance(key, tuple)
        assert isinstance(key[0], Muid) and isinstance(key[1], Muid)
        key[0].put_into(entry_builder.pair.left)
        key[1].put_into(entry_builder.pair.rite)
    else:
        raise Exception(f"don't know how to creating a deleting entry for behavior {behavior}")
    return entry_builder


def decode_entry_occupant(entry_muid: Muid, builder: EntryBuilder) -> Union[UserValue, Muid, Deletion, Inclusion]:
    """ Determines what a container "contains" in a given entry.

        The full entry storage pair is required because if it points to something that pointer
        might be relative to the entry address.
    """
    if builder.deletion:
        return deletion
    if builder.HasField("pointee"):
        return Muid.create(builder=builder.pointee, context=entry_muid)
    if builder.HasField("value"):
        return decode_value(builder.value)
    if builder.behavior in (GROUP, KEY_SET):
        return inclusion
    raise ValueError(f"can't interpret {builder}")


def entries_equiv(pair1: PlacementBuilderPair, pair2: PlacementBuilderPair) -> bool:
    """ Checks the contained value/pointee/whatever to see if the entries are equiv.

        Used to see if the effective value in a container is the same even if it
        has a new entry.
    """
    assert pair1.placement != pair2.placement, "comparing an entry to itself"
    assert pair1.placement.middle == pair2.placement.middle
    assert pair1.placement.container == pair2.placement.container
    if pair1.builder.HasField("pointee"):
        if pair2.builder.HasField("pointee"):
            pointee1 = Muid.create(builder=pair1.builder.pointee, context=pair1.placement)
            pointee2 = Muid.create(builder=pair2.builder.pointee, context=pair2.placement)
            return pointee1 == pointee2
        return False
    if pair1.builder.HasField("value"):
        if pair2.builder.HasField("value"):
            value1 = decode_value(pair1.builder.value)
            value2 = decode_value(pair2.builder.value)
            return value1 == value2
        return False
    raise AssertionError("entry doesn't have pointee or immedate?")


def decode_value(value_builder: ValueBuilder) -> UserValue:
    """ decodes a protobuf value into a python value.
    """
    assert isinstance(value_builder, ValueBuilder), f"value_builder is type {type(value_builder)}"
    # pylint: disable=too-many-return-statements
    # pylint: disable=maybe-no-member
    if value_builder.HasField("special"):
        if value_builder.special == ValueBuilder.Special.NULL:
            return None
        if value_builder.special == ValueBuilder.Special.TRUE:
            return True
        if value_builder.special == ValueBuilder.Special.FALSE:
            return False
    if value_builder.HasField("characters"):
        return value_builder.characters
    if value_builder.HasField("octets"):
        return value_builder.octets
    if value_builder.HasField("doubled"):
        return value_builder.doubled
    if value_builder.HasField("integer"):
        return value_builder.integer
    if value_builder.HasField("bigint"):
        return value_builder.bigint
    if value_builder.HasField("tuple"):
        return tuple([decode_value(x) for x in value_builder.tuple.values])
    if value_builder.HasField("document"):
        result = {}
        for i, key in enumerate(value_builder.document.keys):
            value: ValueBuilder = value_builder.document.values[i]
            result[decode_key(key)] = decode_value(value)
        return result
    raise ValueError(
        "don't know how to decode: %r,%s" % (
            value_builder,
            type(value_builder)))  # pylint: disable=consider-using-f-string


def encode_muts(number: Union[int, float, None], _q_struct=Struct(">q")) -> bytes:
    """ packs a microsecond timestamp into a big-endian integer, with None=>0 and Inf=>-1 """
    if not number:
        return ZERO_64
    if number == INT_INF or number == FLOAT_INF:
        number = -1
    if isinstance(number, float):
        assert number.is_integer()
        number = int(number)
    return _q_struct.pack(number)


def decode_muts(data: bytes, _q_struct=Struct(">q")) -> Optional[MuTimestamp]:
    """ unpacks 8 bytes of data into a MuTimestamp by assuming big-endian encoding

        Treats 0 as "None" and -1 as "integer infinity" (i.e. highest unsigned 64 bit number)
    """
    result = _q_struct.unpack(data)[0]
    return INT_INF if result == -1 else (result or None)


def encode_key(key: UserKey, builder: Optional[KeyBuilder] = None) -> KeyBuilder:
    """ Encodes a valid key (int or str or bytes) into a protobuf Value.
    """
    if builder is None:
        builder = KeyBuilder()
    if isinstance(key, str):
        builder.characters = key
    elif isinstance(key, int):
        if abs(key) > KEY_MAX:
            raise ValueError("integer key outside of allowed range")
        builder.number = key
    elif isinstance(key, bytes):
        builder.octets = key
    else:
        raise ValueError(f"can't use as key: {key}")
    return builder


def decode_key(from_what: Union[EntryBuilder, KeyBuilder, bytes]) -> Optional[UserKey]:
    """ extracts the key from a proto entry """
    if isinstance(from_what, KeyBuilder):
        key_builder = from_what
    elif isinstance(from_what, EntryBuilder):
        key_builder = from_what.key
    elif isinstance(from_what, bytes):
        key_builder = KeyBuilder.FromString(from_what)
    else:
        raise ValueError("not an argument of an expected type")
    assert isinstance(key_builder, KeyBuilder)

    if key_builder.HasField("number"):
        return key_builder.number
    if key_builder.HasField("characters"):
        return key_builder.characters
    if key_builder.HasField("octets"):
        return key_builder.octets
    return None


def encode_value(value: UserValue, value_builder: Optional[ValueBuilder] = None) -> ValueBuilder:
    """ encodes a python value (number, string, etc.) into a protobuf builder
    """
    value_builder = value_builder or ValueBuilder()
    if isinstance(value, bytes):
        value_builder.octets = value
        return value_builder
    if isinstance(value, str):
        value_builder.characters = value
        return value_builder
    if isinstance(value, bool):
        if value:
            value_builder.special = ValueBuilder.Special.TRUE
        else:
            value_builder.special = ValueBuilder.Special.FALSE
        return value_builder
    if isinstance(value, float):
        value_builder.doubled = value
        return value_builder
    if isinstance(value, int):
        if value >  2_147_483_647 or value < -2_147_483_648:
            value_builder.bigint = value
        else:
            value_builder.integer = value
        return value_builder
    if value is None:
        value_builder.special = ValueBuilder.Special.NULL
        return value_builder
    if isinstance(value, (tuple, list)):
        the_tuple = value_builder.tuple
        assert the_tuple is not None
        if len(value) == 0:
            value_builder.tuple.values.append(ValueBuilder())
            value_builder.tuple.values.pop()
        for val in value:
            value_builder.tuple.values.append(encode_value(val))
        return value_builder
    if isinstance(value, dict):
        value_builder.document.keys.append(KeyBuilder())
        value_builder.document.keys.pop()
        for key, val in value.items():
            value_builder.document.keys.append(encode_key(key))
            value_builder.document.values.append(encode_value(val))
        return value_builder
    raise ValueError("don't know how to encode: %r" % value)  # pylint: disable=consider-using-f-string


def wrap_change(builder: EntryBuilder) -> ChangeBuilder:
    """ A simple utility function to create a change and then copy the provided entry into it. """
    change_builder = ChangeBuilder()
    change_builder.entry.CopyFrom(builder)
    return change_builder
