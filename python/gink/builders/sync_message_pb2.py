# -*- coding: utf-8 -*-
# Generated by the protocol buffer compiler.  DO NOT EDIT!
# source: sync_message.proto

from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from google.protobuf import reflection as _reflection
from google.protobuf import symbol_database as _symbol_database
# @@protoc_insertion_point(imports)

_sym_db = _symbol_database.Default()




DESCRIPTOR = _descriptor.FileDescriptor(
  name='sync_message.proto',
  package='google.gink',
  syntax='proto3',
  serialized_options=None,
  create_key=_descriptor._internal_create_key,
  serialized_pb=b'\n\x12sync_message.proto\x12\x0bgoogle.gink\"\x81\x03\n\x0bSyncMessage\x12\x10\n\x06\x62undle\x18\x01 \x01(\x0cH\x00\x12\x35\n\x08greeting\x18\x02 \x01(\x0b\x32!.google.gink.SyncMessage.GreetingH\x00\x12+\n\x03\x61\x63k\x18\x03 \x01(\x0b\x32\x1c.google.gink.SyncMessage.AckH\x00\x1a\x9b\x01\n\x08Greeting\x12@\n\x07\x65ntries\x18\x01 \x03(\x0b\x32/.google.gink.SyncMessage.Greeting.GreetingEntry\x1aM\n\rGreetingEntry\x12\x11\n\tmedallion\x18\x01 \x01(\x04\x12\x13\n\x0b\x63hain_start\x18\x02 \x01(\x04\x12\x14\n\x0cseen_through\x18\x03 \x01(\x04\x1aR\n\x03\x41\x63k\x12\x11\n\tmedallion\x18\x01 \x01(\x04\x12\x13\n\x0b\x63hain_start\x18\x02 \x01(\x04\x12\x11\n\ttimestamp\x18\x03 \x01(\x04\x12\x10\n\x08previous\x18\x04 \x01(\x04\x42\n\n\x08\x63ontentsb\x06proto3'
)




_SYNCMESSAGE_GREETING_GREETINGENTRY = _descriptor.Descriptor(
  name='GreetingEntry',
  full_name='google.gink.SyncMessage.Greeting.GreetingEntry',
  filename=None,
  file=DESCRIPTOR,
  containing_type=None,
  create_key=_descriptor._internal_create_key,
  fields=[
    _descriptor.FieldDescriptor(
      name='medallion', full_name='google.gink.SyncMessage.Greeting.GreetingEntry.medallion', index=0,
      number=1, type=4, cpp_type=4, label=1,
      has_default_value=False, default_value=0,
      message_type=None, enum_type=None, containing_type=None,
      is_extension=False, extension_scope=None,
      serialized_options=None, file=DESCRIPTOR,  create_key=_descriptor._internal_create_key),
    _descriptor.FieldDescriptor(
      name='chain_start', full_name='google.gink.SyncMessage.Greeting.GreetingEntry.chain_start', index=1,
      number=2, type=4, cpp_type=4, label=1,
      has_default_value=False, default_value=0,
      message_type=None, enum_type=None, containing_type=None,
      is_extension=False, extension_scope=None,
      serialized_options=None, file=DESCRIPTOR,  create_key=_descriptor._internal_create_key),
    _descriptor.FieldDescriptor(
      name='seen_through', full_name='google.gink.SyncMessage.Greeting.GreetingEntry.seen_through', index=2,
      number=3, type=4, cpp_type=4, label=1,
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
  serialized_start=248,
  serialized_end=325,
)

_SYNCMESSAGE_GREETING = _descriptor.Descriptor(
  name='Greeting',
  full_name='google.gink.SyncMessage.Greeting',
  filename=None,
  file=DESCRIPTOR,
  containing_type=None,
  create_key=_descriptor._internal_create_key,
  fields=[
    _descriptor.FieldDescriptor(
      name='entries', full_name='google.gink.SyncMessage.Greeting.entries', index=0,
      number=1, type=11, cpp_type=10, label=3,
      has_default_value=False, default_value=[],
      message_type=None, enum_type=None, containing_type=None,
      is_extension=False, extension_scope=None,
      serialized_options=None, file=DESCRIPTOR,  create_key=_descriptor._internal_create_key),
  ],
  extensions=[
  ],
  nested_types=[_SYNCMESSAGE_GREETING_GREETINGENTRY, ],
  enum_types=[
  ],
  serialized_options=None,
  is_extendable=False,
  syntax='proto3',
  extension_ranges=[],
  oneofs=[
  ],
  serialized_start=170,
  serialized_end=325,
)

_SYNCMESSAGE_ACK = _descriptor.Descriptor(
  name='Ack',
  full_name='google.gink.SyncMessage.Ack',
  filename=None,
  file=DESCRIPTOR,
  containing_type=None,
  create_key=_descriptor._internal_create_key,
  fields=[
    _descriptor.FieldDescriptor(
      name='medallion', full_name='google.gink.SyncMessage.Ack.medallion', index=0,
      number=1, type=4, cpp_type=4, label=1,
      has_default_value=False, default_value=0,
      message_type=None, enum_type=None, containing_type=None,
      is_extension=False, extension_scope=None,
      serialized_options=None, file=DESCRIPTOR,  create_key=_descriptor._internal_create_key),
    _descriptor.FieldDescriptor(
      name='chain_start', full_name='google.gink.SyncMessage.Ack.chain_start', index=1,
      number=2, type=4, cpp_type=4, label=1,
      has_default_value=False, default_value=0,
      message_type=None, enum_type=None, containing_type=None,
      is_extension=False, extension_scope=None,
      serialized_options=None, file=DESCRIPTOR,  create_key=_descriptor._internal_create_key),
    _descriptor.FieldDescriptor(
      name='timestamp', full_name='google.gink.SyncMessage.Ack.timestamp', index=2,
      number=3, type=4, cpp_type=4, label=1,
      has_default_value=False, default_value=0,
      message_type=None, enum_type=None, containing_type=None,
      is_extension=False, extension_scope=None,
      serialized_options=None, file=DESCRIPTOR,  create_key=_descriptor._internal_create_key),
    _descriptor.FieldDescriptor(
      name='previous', full_name='google.gink.SyncMessage.Ack.previous', index=3,
      number=4, type=4, cpp_type=4, label=1,
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
  serialized_start=327,
  serialized_end=409,
)

_SYNCMESSAGE = _descriptor.Descriptor(
  name='SyncMessage',
  full_name='google.gink.SyncMessage',
  filename=None,
  file=DESCRIPTOR,
  containing_type=None,
  create_key=_descriptor._internal_create_key,
  fields=[
    _descriptor.FieldDescriptor(
      name='bundle', full_name='google.gink.SyncMessage.bundle', index=0,
      number=1, type=12, cpp_type=9, label=1,
      has_default_value=False, default_value=b"",
      message_type=None, enum_type=None, containing_type=None,
      is_extension=False, extension_scope=None,
      serialized_options=None, file=DESCRIPTOR,  create_key=_descriptor._internal_create_key),
    _descriptor.FieldDescriptor(
      name='greeting', full_name='google.gink.SyncMessage.greeting', index=1,
      number=2, type=11, cpp_type=10, label=1,
      has_default_value=False, default_value=None,
      message_type=None, enum_type=None, containing_type=None,
      is_extension=False, extension_scope=None,
      serialized_options=None, file=DESCRIPTOR,  create_key=_descriptor._internal_create_key),
    _descriptor.FieldDescriptor(
      name='ack', full_name='google.gink.SyncMessage.ack', index=2,
      number=3, type=11, cpp_type=10, label=1,
      has_default_value=False, default_value=None,
      message_type=None, enum_type=None, containing_type=None,
      is_extension=False, extension_scope=None,
      serialized_options=None, file=DESCRIPTOR,  create_key=_descriptor._internal_create_key),
  ],
  extensions=[
  ],
  nested_types=[_SYNCMESSAGE_GREETING, _SYNCMESSAGE_ACK, ],
  enum_types=[
  ],
  serialized_options=None,
  is_extendable=False,
  syntax='proto3',
  extension_ranges=[],
  oneofs=[
    _descriptor.OneofDescriptor(
      name='contents', full_name='google.gink.SyncMessage.contents',
      index=0, containing_type=None,
      create_key=_descriptor._internal_create_key,
    fields=[]),
  ],
  serialized_start=36,
  serialized_end=421,
)

_SYNCMESSAGE_GREETING_GREETINGENTRY.containing_type = _SYNCMESSAGE_GREETING
_SYNCMESSAGE_GREETING.fields_by_name['entries'].message_type = _SYNCMESSAGE_GREETING_GREETINGENTRY
_SYNCMESSAGE_GREETING.containing_type = _SYNCMESSAGE
_SYNCMESSAGE_ACK.containing_type = _SYNCMESSAGE
_SYNCMESSAGE.fields_by_name['greeting'].message_type = _SYNCMESSAGE_GREETING
_SYNCMESSAGE.fields_by_name['ack'].message_type = _SYNCMESSAGE_ACK
_SYNCMESSAGE.oneofs_by_name['contents'].fields.append(
  _SYNCMESSAGE.fields_by_name['bundle'])
_SYNCMESSAGE.fields_by_name['bundle'].containing_oneof = _SYNCMESSAGE.oneofs_by_name['contents']
_SYNCMESSAGE.oneofs_by_name['contents'].fields.append(
  _SYNCMESSAGE.fields_by_name['greeting'])
_SYNCMESSAGE.fields_by_name['greeting'].containing_oneof = _SYNCMESSAGE.oneofs_by_name['contents']
_SYNCMESSAGE.oneofs_by_name['contents'].fields.append(
  _SYNCMESSAGE.fields_by_name['ack'])
_SYNCMESSAGE.fields_by_name['ack'].containing_oneof = _SYNCMESSAGE.oneofs_by_name['contents']
DESCRIPTOR.message_types_by_name['SyncMessage'] = _SYNCMESSAGE
_sym_db.RegisterFileDescriptor(DESCRIPTOR)

SyncMessage = _reflection.GeneratedProtocolMessageType('SyncMessage', (_message.Message,), {

  'Greeting' : _reflection.GeneratedProtocolMessageType('Greeting', (_message.Message,), {

    'GreetingEntry' : _reflection.GeneratedProtocolMessageType('GreetingEntry', (_message.Message,), {
      'DESCRIPTOR' : _SYNCMESSAGE_GREETING_GREETINGENTRY,
      '__module__' : 'sync_message_pb2'
      # @@protoc_insertion_point(class_scope:google.gink.SyncMessage.Greeting.GreetingEntry)
      })
    ,
    'DESCRIPTOR' : _SYNCMESSAGE_GREETING,
    '__module__' : 'sync_message_pb2'
    # @@protoc_insertion_point(class_scope:google.gink.SyncMessage.Greeting)
    })
  ,

  'Ack' : _reflection.GeneratedProtocolMessageType('Ack', (_message.Message,), {
    'DESCRIPTOR' : _SYNCMESSAGE_ACK,
    '__module__' : 'sync_message_pb2'
    # @@protoc_insertion_point(class_scope:google.gink.SyncMessage.Ack)
    })
  ,
  'DESCRIPTOR' : _SYNCMESSAGE,
  '__module__' : 'sync_message_pb2'
  # @@protoc_insertion_point(class_scope:google.gink.SyncMessage)
  })
_sym_db.RegisterMessage(SyncMessage)
_sym_db.RegisterMessage(SyncMessage.Greeting)
_sym_db.RegisterMessage(SyncMessage.Greeting.GreetingEntry)
_sym_db.RegisterMessage(SyncMessage.Ack)


# @@protoc_insertion_point(module_scope)
