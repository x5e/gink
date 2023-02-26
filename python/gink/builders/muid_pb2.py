# -*- coding: utf-8 -*-
# Generated by the protocol buffer compiler.  DO NOT EDIT!
# source: muid.proto

from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from google.protobuf import reflection as _reflection
from google.protobuf import symbol_database as _symbol_database
# @@protoc_insertion_point(imports)

_sym_db = _symbol_database.Default()




DESCRIPTOR = _descriptor.FileDescriptor(
  name='muid.proto',
  package='google.gink',
  syntax='proto3',
  serialized_options=None,
  create_key=_descriptor._internal_create_key,
  serialized_pb=b'\n\nmuid.proto\x12\x0bgoogle.gink\"<\n\x04Muid\x12\x11\n\ttimestamp\x18\x01 \x01(\x12\x12\x11\n\tmedallion\x18\x02 \x01(\x12\x12\x0e\n\x06offset\x18\x03 \x01(\rb\x06proto3'
)




_MUID = _descriptor.Descriptor(
  name='Muid',
  full_name='google.gink.Muid',
  filename=None,
  file=DESCRIPTOR,
  containing_type=None,
  create_key=_descriptor._internal_create_key,
  fields=[
    _descriptor.FieldDescriptor(
      name='timestamp', full_name='google.gink.Muid.timestamp', index=0,
      number=1, type=18, cpp_type=2, label=1,
      has_default_value=False, default_value=0,
      message_type=None, enum_type=None, containing_type=None,
      is_extension=False, extension_scope=None,
      serialized_options=None, file=DESCRIPTOR,  create_key=_descriptor._internal_create_key),
    _descriptor.FieldDescriptor(
      name='medallion', full_name='google.gink.Muid.medallion', index=1,
      number=2, type=18, cpp_type=2, label=1,
      has_default_value=False, default_value=0,
      message_type=None, enum_type=None, containing_type=None,
      is_extension=False, extension_scope=None,
      serialized_options=None, file=DESCRIPTOR,  create_key=_descriptor._internal_create_key),
    _descriptor.FieldDescriptor(
      name='offset', full_name='google.gink.Muid.offset', index=2,
      number=3, type=13, cpp_type=3, label=1,
      has_default_value=False, default_value=0,
      message_type=None, enum_type=None, containing_type=None,
      is_extension=False, extension_scope=None,
      serialized_options=None, file=DESCRIPTOR,  create_key=_descriptor._internal_create_key),
  ],
  extensions=[
  ],
  nested_types=[],
  enum_types=[
  ],
  serialized_options=None,
  is_extendable=False,
  syntax='proto3',
  extension_ranges=[],
  oneofs=[
  ],
  serialized_start=27,
  serialized_end=87,
)

DESCRIPTOR.message_types_by_name['Muid'] = _MUID
_sym_db.RegisterFileDescriptor(DESCRIPTOR)

Muid = _reflection.GeneratedProtocolMessageType('Muid', (_message.Message,), {
  'DESCRIPTOR' : _MUID,
  '__module__' : 'muid_pb2'
  # @@protoc_insertion_point(class_scope:google.gink.Muid)
  })
_sym_db.RegisterMessage(Muid)


# @@protoc_insertion_point(module_scope)
