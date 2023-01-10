from typing import Optional

from ..builders.behavior_pb2 import Behavior
from ..builders.container_pb2 import Container as ContainerBuilder

from .container import Container
from .directory import Directory
from .sequence import Sequence
from .property import Property
from .database import Database
from .muid import Muid
from .coding import DIRECTORY, SEQUENCE, PROPERTY

def get_container(
    self: Database,
    muid: Muid,
    container_builder: Optional[ContainerBuilder]=None,
    subtypes = {
        DIRECTORY: Directory,
        SEQUENCE: Sequence,
        PROPERTY: Property,
    }
) -> Container:
    """ Gets a pre-existing container. """
    if muid.timestamp == -1:
        behavior = muid.offset
    else:
        container_builder = container_builder or self._store.get_container(muid)
        behavior = getattr(container_builder, "behavior")
    Class = subtypes.get(behavior)
    if not Class:
        raise AssertionError(f"behavior not recognized: {behavior}")
    return Class(muid=muid, database=self)

Database.get_container = get_container

patched = True
