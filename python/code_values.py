""" Utility functions for encoding and decoding values.
"""
from typing import Union, Optional
from value_pb2 import Value as ValueBuilder
from entry_pb2 import Entry as EntryBuilder


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


def encode_key(key: Union[str, int], builder: EntryBuilder):
    """ Encodes a valid key (int or str) into a protobuf Value.
    """
    if isinstance(key, str):
        builder.key.characters = key # type: ignore # pylint: disable=maybe-no-member
    if isinstance(key, int):
        builder.key.number = key # type: ignore # pylint: disable=maybe-no-member

def decode_key(builder: EntryBuilder):
    """ extracts the key from a proto entry """
    if builder.key.HasField("number"):  # type: ignore
        return builder.number # type: ignore
    if builder.key.HasField("characters"):  # type: ignore
        return builder.characters  # type: ignore
    raise AssertionError("no key?")


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
