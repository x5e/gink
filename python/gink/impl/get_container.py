from typing import Optional

from .muid import Muid
from .builders import Behavior
from .database import Database
from .container import Container
from .directory import Directory
from .sequence import Sequence
from .box import Box
from .pair_map import PairMap
from .key_set import KeySet
from .graph import EdgeType, Vertex
from .group import Group
from .pair_set import PairSet
from .property import Property

__all__ = ["get_container"]

_classes: dict = {
    Behavior.BOX: Box,
    Behavior.SEQUENCE: Sequence,
    Behavior.PAIR_MAP: PairMap,
    Behavior.DIRECTORY: Directory,
    Behavior.KEY_SET: KeySet,
    Behavior.GROUP: Group,
    Behavior.VERTEX: Vertex,
    Behavior.PAIR_SET: PairSet,
	Behavior.EDGE_TYPE: EdgeType,
    Behavior.PROPERTY: Property,
}


def get_container(
		*,
		muid: Muid,
		behavior: int,
		database: Database,
) -> Container:
	""" Gets a pre-existing container associated with a particular muid """
	container_class = _classes.get(behavior)
	if container_class is None:
		raise ValueError(f"don't know how to create a container with behavior: {behavior}")
	return container_class(muid=muid, database=database)
