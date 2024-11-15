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
from .braid import Braid

__all__ = ["get_container", "container_classes"]

container_classes: dict = {
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
    Behavior.BRAID: Braid,
}


def get_container(
		*,
		muid: Muid,
		database: Database,
		behavior: Optional[int] = None,
) -> Container:
	""" Gets a pre-existing container associated with a particular muid """
	if muid.timestamp == -1 and behavior is None:
		behavior = muid.offset
	if behavior is None:
		store = database.get_store()
		container_builder = store.get_container(muid)
		if container_builder is None:
			raise ValueError(f"could not find definition for {muid}")
		behavior = container_builder.behavior
	assert behavior is not None
	container_class = container_classes.get(behavior)
	if container_class is None:
		raise ValueError(f"don't know how to create a container with behavior: {behavior}")
	return container_class(muid=muid, database=database)
