from ..builders.behavior_pb2 import Behavior

from .container import Container
from .directory import Directory
from .sequence import Sequence
from .property import Property

Container._subtypes.setdefault(Behavior.DIRECTORY, Directory) # type: ignore
Container._subtypes.setdefault(Behavior.SEQUENCE, Sequence) # type: ignore
Container._subtypes.setdefault(Behavior.PROPERTY, Property) # type: ignore

PATCHED = True
