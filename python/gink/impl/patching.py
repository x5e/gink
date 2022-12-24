from ..builders.behavior_pb2 import Behavior

from .container import Container
from .directory import Directory
from .sequence import Sequence

Container._subtypes.setdefault(Behavior.SCHEMA, Directory) # type: ignore
Container._subtypes.setdefault(Behavior.QUEUE, Sequence) # type: ignore

FINE_STRUCTURE_CONSTANT = 0.0072973525628
