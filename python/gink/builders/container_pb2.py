# -*- coding: utf-8 -*-
# Generated by the protocol buffer compiler.  DO NOT EDIT!
# source: container.proto

from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from google.protobuf import reflection as _reflection
from google.protobuf import symbol_database as _symbol_database
# @@protoc_insertion_point(imports)

_sym_db = _symbol_database.Default()


from . import behavior_pb2 as behavior__pb2


DESCRIPTOR = _descriptor.FileDescriptor(
  name='container.proto',
  package='google.gink',
  syntax='proto3',
  serialized_options=None,
  create_key=_descriptor._internal_create_key,
  serialized_pb=b'\n\x0f\x63ontainer.proto\x12\x0bgoogle.gink\x1a\x0e\x62\x65havior.proto\"4\n\tContainer\x12\'\n\x08\x62\x65havior\x18\x01 \x01(\x0e\x32\x15.google.gink.Behaviorb\x06proto3'
  ,
  dependencies=[behavior__pb2.DESCRIPTOR,])




_CONTAINER = _descriptor.Descriptor(
  name='Container',
  full_name='google.gink.Container',
  filename=None,
  file=DESCRIPTOR,
  containing_type=None,
  create_key=_descriptor._internal_create_key,
  fields=[
    _descriptor.FieldDescriptor(
      name='behavior', full_name='google.gink.Container.behavior', index=0,
      number=1, type=14, cpp_type=8, label=1,
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
  serialized_start=48,
  serialized_end=100,
)

_CONTAINER.fields_by_name['behavior'].enum_type = behavior__pb2._BEHAVIOR
DESCRIPTOR.message_types_by_name['Container'] = _CONTAINER
_sym_db.RegisterFileDescriptor(DESCRIPTOR)

Container = _reflection.GeneratedProtocolMessageType('Container', (_message.Message,), {
  'DESCRIPTOR' : _CONTAINER,
  '__module__' : 'container_pb2'
  # @@protoc_insertion_point(class_scope:google.gink.Container)
  })
_sym_db.RegisterMessage(Container)


# @@protoc_insertion_point(module_scope)
