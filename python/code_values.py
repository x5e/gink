""" Utility functions for encoding and decoding values, keys, and other binary data
"""
from typing import Optional, Union
from struct import Struct

from value_pb2 import Value as ValueBuilder
from entry_pb2 import Entry as EntryBuilder
from key_pb2 import Key as KeyBuilder

from typedefs import Key
from muid import Muid

def create_deleting_entry(muid: Muid, key: Optional[Key]) -> EntryBuilder:
    """ creates an entry that will delete the given key from the container

        I'm allowing a null key in the argument then barfing if it's null
        inside in part because it results in an easier to use API.
    """
    if key is None:
        raise ValueError("can't create deleting entries without key")
    # TODO: add the behavior value appropriately
    entry_builder = EntryBuilder()
    muid.put_into(entry_builder.container)
    entry_builder.deleting = True
    return entry_builder

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

def encode_key(key: Key, builder: Optional[KeyBuilder] = None) -> KeyBuilder:
    """ Encodes a valid key (int or str) into a protobuf Value.
    """
    if builder is None:
        builder = KeyBuilder()
    if isinstance(key, str):
        builder.characters = key # type: ignore # pylint: disable=maybe-no-member
    if isinstance(key, int):
        builder.number = key # type: ignore # pylint: disable=maybe-no-member
    return builder


def decode_key(from_what: Union[EntryBuilder, KeyBuilder, bytes]) -> Optional[Key]:
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
    return None # None


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
