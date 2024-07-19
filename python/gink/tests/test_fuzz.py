from random import choice, choices, randint, random, randbytes
from string import ascii_lowercase
from typing import Tuple, Dict, Set
from datetime import datetime
from io import StringIO
from contextlib import closing

from ..impl.container import Container
from ..impl.database import Database
from ..impl.lmdb_store import LmdbStore
from ..impl.memory_store import MemoryStore
from ..impl.directory import Directory
from ..impl.sequence import Sequence
from ..impl.key_set import KeySet
from ..impl.box import Box
from ..impl.pair_set import PairSet
from ..impl.pair_map import PairMap
from ..impl.property import Property
from ..impl.group import Group
from ..impl.braid import Braid
from ..impl.muid import Muid
from ..impl.chain_tracker import Chain
from ..impl.utilities import generate_medallion, generate_timestamp
from ..impl.graph import Edge, Verb, Vertex
from ..impl.coding import BOX, DIRECTORY, KEY_SET, SEQUENCE, PAIR_SET, PAIR_MAP, PROPERTY, GROUP, BRAID

# TODO: Test graph

NUM_ENTRIES = 50
UserKey = {str, int, bytes}
NoIterables = {str, int, float, bytes, bool, None, datetime}
UserValue = NoIterables.union({list, tuple, dict})

ValueContainer = UserValue.union({Container})
Pair = {Tuple[Container, Container], Tuple[Muid, Muid]}
CONTAINERS = [Box, Directory, KeySet, Sequence, PairSet, PairMap, Property, Group]
ALL_GINK_TYPES: set = ValueContainer.union({Muid, Edge, Chain}).union(Pair)
CONTAINER_KEY_TYPES: Dict[int, Set] = {
    BOX: {None},
    SEQUENCE: {None},
    PAIR_MAP: Pair,
    DIRECTORY: {str, int, bytes},
    KEY_SET: {str, int, bytes},
    GROUP: {Container, Muid},
    PAIR_SET: Pair,
    PROPERTY: {Container},
    BRAID: {Chain},
}
CONTAINER_VALUE_TYPES: Dict[int, Set] = {
    BOX: ValueContainer,
    SEQUENCE: ValueContainer,
    PAIR_MAP: ValueContainer,
    DIRECTORY: ValueContainer,
    KEY_SET: {None},
    GROUP: {None},
    PAIR_SET: {None},
    PROPERTY: ValueContainer,
    BRAID: {int, float},
}

def set_choice(set):
    rand = randint(0, len(set) - 1)
    i = 0
    for item in set:
        if i == rand:
            return item
        i += 1

def test_random():
    # get_edge_entries currently not working in MemoryStore
    for store in [LmdbStore(), ]:
        with closing(store):
            database = Database(store=store)

            box = Box()
            try_random_good_data(box)
            try_random_bad_data(box)

            directory = Directory()
            try_random_good_data(directory)
            try_random_bad_data(directory)

            key_set = KeySet()
            try_random_good_data(key_set)
            try_random_bad_data(key_set)

            sequence = Sequence()
            try_random_good_data(sequence)
            try_random_bad_data(sequence)

            property = Property()
            try_random_good_data(property)
            try_random_bad_data(property)

            pair_map = PairMap()
            try_random_good_data(pair_map)
            try_random_bad_data(pair_map)

            pair_set = PairSet()
            try_random_good_data(pair_set)
            try_random_bad_data(pair_set)

            group = Group()
            try_random_good_data(group)
            try_random_bad_data(group)

            # TODO: graph

            str_io = StringIO()
            database.dump(file=str_io)

            # TODO: reconstruct database

def random_data(type):
    max_str = 468 # lmdb key cant be more than 468 characters

    if type == str:
        k = randint(1, max_str)
        return "".join(choices(ascii_lowercase, k=k))
    elif type == int:
        return randint(0, 10000)
    elif type == float:
        return random() * 10000
    elif type == datetime:
        return datetime.now()
    elif type == bytes:
        return randbytes(50)
    elif type == bool:
        return choice([True, False])
    elif type == list:
        return [random_data(type=set_choice(NoIterables)) for _ in range(randint(1, 50))]
    elif type == Tuple[Container, Container]:
        return (random_container(), random_container())
    elif type == Tuple[Muid, Muid]:
        return (random_container().get_muid(), random_container().get_muid())
    elif type == tuple:
        return tuple(random_data(type=set_choice(NoIterables)) for _ in range(randint(1, 50)))
    elif type == dict:
        return {random_data(type=set_choice(UserKey)): random_data(type=set_choice(NoIterables))
                for _ in range(randint(1, 50))}
    elif type == Container:
        return random_container() # TODO: fill container with some amount of data?
    elif type == Muid:
        return random_container().get_muid()
    elif type == Edge:
        edge = Verb().create_edge(sub=Vertex(), obj=Vertex())
        edge.dumps()
        return edge
    elif type == Chain:
        chain = Chain(medallion=generate_medallion(), chain_start=generate_timestamp())
        return chain
    elif type == None:
        return None

def random_container() -> Container:
    return choice(CONTAINERS)()

def try_random_good_data(container: Container):
    good_key_types = CONTAINER_KEY_TYPES[container.get_behavior()]
    good_value_types = CONTAINER_VALUE_TYPES[container.get_behavior()]
    for _ in range(randint(1, NUM_ENTRIES)):
        key = random_data(type=set_choice(good_key_types))
        value = random_data(type=set_choice(good_value_types))
        container_set_adapter(container, key, value)

def try_random_bad_data(container: Container):
    bad_key_types = ALL_GINK_TYPES - CONTAINER_KEY_TYPES[container.get_behavior()]
    bad_value_types = ALL_GINK_TYPES - CONTAINER_VALUE_TYPES[container.get_behavior()]
    for _ in range(randint(1, NUM_ENTRIES)):
        key = random_data(type=set_choice(bad_key_types))
        value = random_data(type=set_choice(bad_value_types))
        try:
            container_set_adapter(container, key, value, check=False)
            raise AssertionError(f"Bad Data Test: {container.__class__.__name__}: key:{repr(key)} value:{repr(value)}")
        except Exception as e:
            error_name = e.__class__.__name__
            if error_name not in ("TypeCheckError", "TypeError"):
                raise e
            continue

def container_set_adapter(container: Container, key, value, check=True):
    """ if check is True, check to see if the value is set correctly """
    if container.get_behavior() == BOX:
        assert isinstance(container, Box)
        container.set(value)
        if check:
            if isinstance(value, list):
                value = tuple(value)
            gotten = container.get()
            assert gotten == value, f"Expected {value}, \ngot {gotten}"
    elif container.get_behavior() == DIRECTORY:
        assert isinstance(container, Directory)
        container.set(key, value)
        if check:
            if isinstance(value, list):
                value = tuple(value)
            gotten = container.get(key)
            assert gotten == value, f"Expected {value}, \ngot {gotten}"
    elif container.get_behavior() == KEY_SET:
        assert isinstance(container, KeySet)
        container.add(key)
        if check:
            assert container.contains(key)
    elif container.get_behavior() == SEQUENCE:
        assert isinstance(container, Sequence)
        container.append(value)
        if check:
            if isinstance(value, list):
                value = tuple(value)
            gotten = container.at(-1)[1]
            assert gotten == value, f"Expected {value}, \ngot {gotten}"
    elif container.get_behavior() == PAIR_MAP:
        assert isinstance(container, PairMap)
        container.set(key, value)
        if check:
            if isinstance(value, list):
                value = tuple(value)
            gotten = container.get(key)
            assert gotten == value, f"Expected {value}, \ngot {gotten}"
    elif container.get_behavior() == PAIR_SET:
        assert isinstance(container, PairSet)
        container.include(key)
        if check:
            assert container.contains(key)
    elif container.get_behavior() == GROUP:
        assert isinstance(container, Group)
        container.include(key)
        if check:
            assert container.contains(key)
    elif container.get_behavior() == PROPERTY:
        assert isinstance(container, Property)
        if isinstance(value, list):
            value = tuple(value)
        container.set(key, value)
        if check:
            gotten = container.get(key)
            assert gotten == value, f"Expected {value}, \ngot {gotten}"
    elif container.get_behavior() == BRAID:
        assert isinstance(container, Braid)
        container.set(key, value)
        if check:
            if isinstance(value, list):
                value = tuple(value)
            gotten = container.get(key, None)
            assert gotten == value, f"Expected {value}, \ngot {gotten}"
