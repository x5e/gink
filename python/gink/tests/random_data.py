# from datetime import datetime
from random import choice, choices, randint, random, randbytes
from string import ascii_lowercase
from typing import Tuple
from datetime import datetime

from ..impl.typedefs import Inclusion
from ..impl.container import Container
from ..impl.database import Database
from ..impl.bundler import Bundler
from ..impl.lmdb_store import LmdbStore
from ..impl.directory import Directory
from ..impl.sequence import Sequence
from ..impl.key_set import KeySet
from ..impl.box import Box
from ..impl.pair_set import PairSet
from ..impl.pair_map import PairMap
from ..impl.property import Property
from ..impl.group import Group
from ..impl.muid import Muid
from ..impl.chain_tracker import Chain
from ..impl.utilities import generate_medallion, generate_timestamp
from ..impl.graph import Edge
from ..impl.coding import BOX, DIRECTORY, KEY_SET, SEQUENCE, PAIR_SET, PAIR_MAP, PROPERTY, GROUP, BRAID

# TODO: Test graph

NUM_ENTRIES = 50
UserKey = {str, int, bytes}
UserValue = {str, int, float, datetime, bytes, bool, list, tuple, dict, None}
ValueContainer = UserValue + {Container}
Pair = {Tuple[Container, Container], Tuple[Muid, Muid]}
CONTAINERS = [Box, Directory, KeySet, Sequence, PairSet, PairMap, Property, Group]
ALL_GINK_TYPES = ValueContainer + {Muid, Edge, Chain} + Pair
CONTAINER_KEY_TYPES = {
    BOX: {None},
    SEQUENCE: {None},
    PAIR_MAP: Pair,
    DIRECTORY: {str, int, bytes},
    KEY_SET: {str, int, bytes},
    GROUP: {Container, Muid},
    PAIR_SET: Pair,
    PROPERTY: {Container, Edge},
    BRAID: {Chain},
}
CONTAINER_VALUE_TYPES = {
    BOX: ValueContainer,
    SEQUENCE: ValueContainer,
    PAIR_MAP: ValueContainer,
    DIRECTORY: ValueContainer,
    KEY_SET: {Inclusion},
    GROUP: {Inclusion},
    PAIR_SET: {Inclusion},
    PROPERTY: ValueContainer,
    BRAID: {int, float},
}

def generate_filled_database() -> Database:
    store = LmdbStore()
    database = Database(store=store)
    bundler = Bundler()

    box = Box(bundler=bundler)
    box.set(random_data(), bundler=bundler)

    directory = Directory(bundler=bundler)
    for _ in range(randint(1, NUM_ENTRIES)):
        directory.set(random_data(key=True), random_data(), bundler=bundler)

    key_set = KeySet(bundler=bundler)
    for _ in range(randint(1, NUM_ENTRIES)):
        key_set.add(random_data(key=True), bundler=bundler)

    sequence = Sequence(bundler=bundler)
    for _ in range(randint(1, NUM_ENTRIES)):
        sequence.append(random_data(), bundler=bundler)

    property = Property(bundler=bundler)
    for _ in range(randint(1, NUM_ENTRIES)):
        property.set(random_container(), choice([random_data(), random_container()]), bundler=bundler)

    pair_map = PairMap(bundler=bundler)
    for _ in range(randint(1, NUM_ENTRIES)):
        pair_map.set([random_container(), random_container()], choice([random_data(), random_container()]), bundler=bundler)

    pair_set = PairSet(bundler=bundler)
    for _ in range(randint(1, NUM_ENTRIES)):
        inc_exc = choice([pair_set.include, pair_set.exclude])
        inc_exc([random_container(), random_container()], bundler=bundler)

    group = Group(bundler=bundler)
    for _ in range(randint(1, NUM_ENTRIES)):
        inc_exc = choice([group.include, group.exclude])
        inc_exc(random_container(), bundler=bundler)

    # TODO: graph

    database.bundle(bundler)
    return database

def random_data(type = None):
    """
    By default includes all UserValue types.
    Pass include_iterables=False to exclude list, tuple, and dict.
    Pass key=True to generate a random UserKey.
    """
    if type == str:
        k = randint(1, 468) # bug with lmdb where key cant be more than 468 characters
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
        return [random_data(include_iterables=False) for _ in range(randint(1, 50))]
    elif type == Tuple[Container, Container]:
        return (random_container(), random_container())
    elif type == Tuple[Muid, Muid]:
        return (random_container().get_muid(), random_container().get_muid())
    elif type == tuple:
        return tuple(random_data(include_iterables=False) for _ in range(randint(1, 50)))
    elif type == dict:
        return {random_data(key=True, include_iterables=False): random_data(include_iterables=False)
                for _ in range(randint(1, 50))}
    elif type == Container:
        return random_container() # TODO: fill container with some amount of data
    elif type == Muid:
        return random_container().get_muid()
    elif type == Edge:
        return Edge(source=random_container().get_muid(), target=random_container().get_muid())
    elif type == Chain:
        chain = Chain()
        chain.medallion = generate_medallion()
        chain.timestamp = generate_timestamp()
        return chain
    elif type == None:
        return None

def random_container() -> Container:
    return choice(CONTAINERS)()

def try_random_good_data(container: Container):
    good_key_types = CONTAINER_KEY_TYPES[type(container)]
    good_value_types = CONTAINER_VALUE_TYPES[type(container)]
    for _ in range(randint(1, 50)):
        pass

def try_random_bad_data(container: Container):
    bad_key_types = ALL_GINK_TYPES - CONTAINER_KEY_TYPES[type(container)]
    bad_value_types = ALL_GINK_TYPES - CONTAINER_VALUE_TYPES[type(container)]
    for _ in range(randint(1, 500)):
        pass


print(generate_filled_database().dump())
