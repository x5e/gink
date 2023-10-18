""" Shoves a bunch of methods into the Database class which couldn't be previously defined. """
from sys import stdout
from typing import Optional

from .builders import ContainerBuilder, Behavior
from .container import Container
from .directory import Directory
from .box import Box
from .sequence import Sequence
from .property import Property
from .database import Database
from .graph import Vertex, Verb
from .pair_map import PairMap
from .pair_set import PairSet
from .key_set import KeySet
from .role import Role
from .muid import Muid
from .typedefs import MuTimestamp, Medallion, GenericTimestamp
from .attribution import Attribution


# pylint: disable=dangerous-default-value disable=protected-access

def get_container(
        self: Database,
        muid: Muid, *,
        container_builder: Optional[ContainerBuilder] = None,
        behavior: Optional[int] = None,
        subtypes={
            Behavior.DIRECTORY: Directory,
            Behavior.SEQUENCE: Sequence,
            Behavior.PROPERTY: Property,
            Behavior.BOX: Box,
            Behavior.ROLE: Role,
            Behavior.VERTEX: Vertex,
            Behavior.VERB: Verb,
            Behavior.KEY_SET: KeySet,
            Behavior.PAIR_SET: PairSet,
            Behavior.PAIR_MAP: PairMap
        }
) -> Container:
    """ Gets a pre-existing container. """
    if muid.timestamp == -1:
        behavior = muid.offset
    elif behavior is None:
        container_builder = container_builder or self._store.get_container(muid)
        behavior = getattr(container_builder, "behavior")
    cls = subtypes.get(behavior)
    if not cls:
        raise AssertionError(f"behavior not recognized: {behavior}")
    return cls(muid=muid, database=self)


setattr(Database, "get_container", get_container)


def get_attribution(
        self: Database, timestamp: MuTimestamp, medallion: Medallion, *_
) -> Attribution:
    """ Takes a timestamp and medallion and figures out who/what to blame the changes on.

        After the timestamp and medallion it will ignore other ordered arguments, so
        that it can be used via ``get_attribution(*muid)``.
    """
    medallion_directory = Directory.get_medallion_instance(
        medallion=medallion, database=self)
    comment = self._store.get_comment(
        medallion=medallion, timestamp=timestamp)
    return Attribution(
        timestamp=timestamp,
        medallion=medallion,
        username=medallion_directory.get(".user.name", as_of=timestamp),
        hostname=medallion_directory.get(".host.name", as_of=timestamp),
        fullname=medallion_directory.get(".full.name", as_of=timestamp),
        software=medallion_directory.get(".software", as_of=timestamp),
        comment=comment,
    )


setattr(Database, "get_attribution", get_attribution)


def dump(self: Database, as_of: GenericTimestamp = None, file=stdout):
    """ writes the contents of the database to file """
    for muid, container_builder in self._store.get_all_containers():
        container = self.get_container(muid, container_builder=container_builder)
        if container.size(as_of=as_of):
            container.dump(as_of=as_of, file=file)


setattr(Database, "dump", dump)

PATCHED = True
