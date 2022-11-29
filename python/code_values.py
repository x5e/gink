""" Utility functions for encoding and decoding values.
"""
from typing import Union
from value_pb2 import Value as ValueBuilder

def decode_value(value_builder: ValueBuilder):
    if value_builder.HasField("special"):
        if value_builder.special == ValueBuilder.Special.NULL:
            return None
        if value_builder.special == ValueBuilder.Special.TRUE:
            return True
        if value_builder.special == ValueBuilder.Special.FALSE:
            return False    
    if value_builder.HasField("characters"):
        return value_builder.characters
    if value_builder.HasField("octects"):
        return value_builder.octects
    if value_builder.HasField("number"):
        return value_builder.number.doubled
    if value_builder.HasField("tuple"):
        return tuple([decode_value(x) for x in value_builder.tuple.values])
    if value_builder.HasField("document"):
        result = {}
        for i in range(len(value_builder.document.keys)):
            result[decode_value(value_builder.document.keys[i])] = decode_value(
                value_builder.document.values[i])
        return result
    raise ValueError("don't know how to decode: %r,%s" % (value_builder, type(value_builder)))
    

def encode_key(value: Union[str, int]) -> ValueBuilder:
    return encode_value(value)

def encode_value(value = None) -> ValueBuilder:
    value_builder = ValueBuilder()
    if isinstance(value, bytes):
        value_builder.octects = value
        return value_builder
    if isinstance(value, str):
        value_builder.characters = value
        return value_builder
    if isinstance(value, (float, int)):
        # TODO: add switch to encoding ints once Javascript implementation supports
        value_builder.number.doubled = float(value)
        return value_builder
    if isinstance(value, bool):
        value_builder.special = ValueBuilder.Special.TRUE if value else ValueBuilder.Special.FALSE
        return value_builder
    if value is None:
        value_builder.special = ValueBuilder.Special.NULL
        return value_builder
    if isinstance(value, (tuple, list)):
        value_builder.tuple
        for val in value:
            value_builder.tuple.values.append(encode_value(val))
        return value_builder
    if isinstance(value, dict):
        value_builder.document
        for key, val in value.items():
            value_builder.document.keys.append(encode_value(key))
            value_builder.document.values.append(encode_value(val))
        return value_builder
    raise ValueError("don't know how to encode: %r" % value)
