""" Utility functions for encoding and decoding values, keys, and other binary data
"""
from typing import Optional, Union, NamedTuple
from struct import Struct

from value_pb2 import Value as ValueBuilder
from entry_pb2 import Entry as EntryBuilder
from key_pb2 import Key as KeyBuilder
from behavior_pb2 import Behavior

from typedefs import UserKey, MuTimestamp
from muid import Muid

class QueueMiddleKey(NamedTuple):
    effective_time: MuTimestamp
    movement_muid: Optional[Muid]

    def __bytes__(self):
        if self.movement_muid:
            return encode_int(self.effective_time) + bytes(self.movement_muid.invert())
        else:
            return encode_int(self.effective_time)

    def from_bytes(data: bytes):
        assert len(data) == 24, len(data)
        if len(data) == 8:
            return QueueMiddleKey(decode_int(data[0:8]), None)
        elif len(data) == 24:
            return QueueMiddleKey(decode_int(data[0:8]), Muid.from_bytes(data[8:]).invert())
        else:
            raise AssertionError("expected QueueMiddleKey to be 8 or 24 bytes")


class EntryStorageKey(NamedTuple):
    """ just a class to serialize / deserialize keys used to store entries

        Notably, this will invert the entry muids so that more recent entries
        for a particular container / user-key come before earlier ones.
    """
    container: Muid
    middle_key: Union[UserKey, QueueMiddleKey]
    entry_muid: Muid
    expiry: Optional[MuTimestamp]

    def replace_time(self, timestamp: int):
        """ create a entry key that can be used for seeking before the given time """
        return EntryStorageKey(self.container, self.middle_key, Muid(timestamp, 0,0,), None)

    def __bytes__(self):
        if isinstance(self.middle_key, QueueMiddleKey):
            serialized_key = bytes(self.middle_key)
        else:
            serialized_key = encode_key(self.middle_key).SerializeToString() # type: ignore
        return (bytes(self.container) + serialized_key +
            bytes(self.entry_muid.invert()) + encode_int(self.expiry or 0))

    @staticmethod
    def from_bytes(data: bytes, behavior: int=Behavior.SCHEMA):
        """ creates an entry key from its binary format """
        container_bytes = data[0:16]
        middle_key_bytes = data[16:-24]
        entry_muid_bytes = data[-24:-8]
        expiry_bytes = data[-8:]
        if behavior == Behavior.SCHEMA:
            middle_key = decode_key(middle_key_bytes)
            assert middle_key is not None, "directory keys must be strings or integers"
        else:
            middle_key = QueueMiddleKey.from_bytes(middle_key_bytes)
        return EntryStorageKey(
                container=Muid.from_bytes(container_bytes),
                middle_key=middle_key,
                entry_muid=Muid.from_bytes(entry_muid_bytes).invert(),
                expiry=MuTimestamp(decode_int(expiry_bytes)) or None)

    def __lt__(self, other):
        # I'm override sort here because I want the same sort order of the binary representation,
        # which will be a little bit different because of flipping the entry muids.
        # Also, sorting would break because keys can be either ints or strings
        return bytes(self) < bytes(other)


class EntryStorageKeyAndVal(NamedTuple):
    """ Parsed entry data. """
    key: EntryStorageKey
    builder: EntryBuilder

def create_deleting_entry(muid: Muid, key: Optional[UserKey]) -> EntryBuilder:
    """ creates an entry that will delete the given key from the container

        I'm allowing a null key in the argument then barfing if it's null
        inside in part because it results in an easier to use API.
    """
    if key is None:
        raise ValueError("can't create deleting entries without key")
    # pylint: disable=maybe-no-member
    entry_builder = EntryBuilder()
    entry_builder.behavior = Behavior.SCHEMA   # type: ignore
    muid.put_into(entry_builder.container)  # type: ignore
    entry_builder.deleting = True  # type: ignore
    encode_key(key, entry_builder.key) # type: ignore
    return entry_builder

def entries_equiv(pair1: EntryStorageKeyAndVal, pair2: EntryStorageKeyAndVal) -> bool:
    """ Checks the contained value/pointee/whatever to see if the entries are equiv.

        Used to see if the effective value in a container is the same even if it
        has a new entry.
    """
    if pair1.key == pair2.key:
        return True
    assert pair1.key.middle_key == pair2.key.middle_key
    assert pair1.key.container == pair2.key.container
    if pair1.builder.HasField("pointee"): # type: ignore
        if pair2.builder.HasField("pointee"): # type: ignore
            pointee1 = Muid.create(pair1.builder.pointee, pair1.key) # type: ignore
            pointee2 = Muid.create(pair2.builder.pointee, pair2.key) # type: ignore
            return pointee1 == pointee2
        return False
    if pair1.builder.HasField("value"): # type: ignore
        if pair2.builder.HasField("value"): # type: ignore
            value1 = decode_value(pair1.builder.value) # type: ignore
            value2 = decode_value(pair2.builder.value) # type: ignore
            return value1 == value2
        return False
    raise AssertionError("entry doesn't have pointee or immedate?")


def decode_value(value_builder: ValueBuilder): # pylint: disable=too-many-return-statements
    """ decodes a protobuf value into a python value.
    """
    if value_builder.HasField("special"):  # type: ignore
        if value_builder.special == ValueBuilder.Special.NULL: # type: ignore # pylint: disable=maybe-no-member
            return None
        if value_builder.special == ValueBuilder.Special.TRUE: # type: ignore # pylint: disable=maybe-no-member
            return True
        if value_builder.special == ValueBuilder.Special.FALSE: # type: ignore # pylint: disable=maybe-no-member
            return False
    if value_builder.HasField("characters"): # type: ignore
        return value_builder.characters # type: ignore
    if value_builder.HasField("octects"): # type: ignore
        return value_builder.octects # type: ignore
    if value_builder.HasField("number"): # type: ignore
        return value_builder.number.doubled # type: ignore
    if value_builder.HasField("tuple"): # type: ignore
        return tuple([decode_value(x) for x in value_builder.tuple.values]) # type: ignore
    if value_builder.HasField("document"): # type: ignore # pylint: disable=maybe-no-member
        result = {}
        for i, _  in enumerate(value_builder.document.keys): # type: ignore # pylint: disable=maybe-no-member
            result[decode_value(value_builder.document.keys[i])] = decode_value( # type: ignore # pylint: disable=maybe-no-member
                value_builder.document.values[i]) # type: ignore # pylint: disable=maybe-no-member
        return result
    raise ValueError("don't know how to decode: %r,%s" % (value_builder, type(value_builder))) # pylint: disable=consider-using-f-string

def encode_int(number: int, _q_struct = Struct(">Q")) -> bytes:
    """ packs an integer into 8 bytes (big-endian) """
    return _q_struct.pack(number)

def decode_int(data: bytes, _q_struct=Struct(">Q")) -> int:
    """ unpacks 8 bytes of data into an int by assuming big-endian encoding """
    return _q_struct.unpack(data)[0]

def encode_key(key: UserKey, builder: Optional[KeyBuilder] = None) -> KeyBuilder:
    """ Encodes a valid key (int or str) into a protobuf Value.
    """
    if builder is None:
        builder = KeyBuilder()
    if isinstance(key, str):
        builder.characters = key # type: ignore # pylint: disable=maybe-no-member
    if isinstance(key, int):
        builder.number = key # type: ignore # pylint: disable=maybe-no-member
    return builder


def decode_key(from_what: Union[EntryBuilder, KeyBuilder, bytes]) -> Optional[UserKey]:
    """ extracts the key from a proto entry """
    if isinstance(from_what, KeyBuilder):
        key_builder = from_what
    elif isinstance(from_what, EntryBuilder):
        key_builder = from_what.key # type: ignore
    elif isinstance(from_what, bytes):
        key_builder = KeyBuilder()
        key_builder.ParseFromString(from_what) # type: ignore
    else:
        raise ValueError("not an argument of an expected type")
    assert isinstance(key_builder, KeyBuilder)

    if key_builder.HasField("number"):  # type: ignore
        return key_builder.number # type: ignore
    if key_builder.HasField("characters"):  # type: ignore
        return key_builder.characters  # type: ignore
    return None


def encode_value(value, value_builder: Optional[ValueBuilder] = None) -> ValueBuilder:
    """ encodes a python value (number, string, etc.) into a protobuf builder
    """
    value_builder = value_builder or ValueBuilder()
    if isinstance(value, bytes):
        value_builder.octects = value # type: ignore # pylint: disable=maybe-no-member
        return value_builder
    if isinstance(value, str):
        value_builder.characters = value # type: ignore # pylint: disable=maybe-no-member
        return value_builder
    if isinstance(value, bool):
        if value:
            value_builder.special = ValueBuilder.Special.TRUE # type: ignore # pylint: disable=maybe-no-member
        else:
            value_builder.special = ValueBuilder.Special.FALSE # type: ignore # pylint: disable=maybe-no-member
        return value_builder
    if isinstance(value, (float, int)):
        # TODO: add switch to encoding ints once Javascript implementation supports
        value_builder.number.doubled = float(value) # type: ignore # pylint: disable=maybe-no-member
        return value_builder
    if value is None:
        value_builder.special = ValueBuilder.Special.NULL # type: ignore # pylint: disable=maybe-no-member
        return value_builder
    if isinstance(value, (tuple, list)):
        value_builder.tuple # type: ignore # pylint: disable=maybe-no-member disable=pointless-statement
        if len(value) == 0:
            value_builder.tuple.values.append(ValueBuilder()) # type: ignore # pylint: disable=maybe-no-member
            value_builder.tuple.values.pop() # type: ignore # pylint: disable=maybe-no-member
        for val in value:
            value_builder.tuple.values.append(encode_value(val)) # type: ignore # pylint: disable=maybe-no-member
        return value_builder
    if isinstance(value, dict):
        value_builder.document.keys.append(ValueBuilder()) # type: ignore # pylint: disable=maybe-no-member
        value_builder.document.keys.pop() # type: ignore # pylint: disable=maybe-no-member
        for key, val in value.items():
            value_builder.document.keys.append(encode_value(key)) # type: ignore # pylint: disable=maybe-no-member
            value_builder.document.values.append(encode_value(val)) # type: ignore # pylint: disable=maybe-no-member
        return value_builder
    raise ValueError("don't know how to encode: %r" % value) # pylint: disable=consider-using-f-string
