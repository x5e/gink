# from datetime import datetime
from random import choice, choices, randint, random, randbytes
from string import ascii_lowercase
from typing import Union

from ..impl.typedefs import UserKey, UserValue
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

NUM_ENTRIES = 50

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

def random_data(key: bool = False, include_iterables: bool = True) -> Union[UserKey, UserValue]:
    """
    By default includes all UserValue types.
    Pass include_iterables=False to exclude list, tuple, and dict.
    Pass key=True to generate a random UserKey.
    """
    include_iterables = False if key else include_iterables

    types = [str, int, bytes]
    if not key:
        types += [float, bool, None] # datetime
    if include_iterables:
        types += [list, tuple, dict]

    type = choice(types)
    if type == str:
        return "".join(choices(ascii_lowercase, k=randint(1, 500)))
    elif type == int:
        return randint(0, 10000)
    elif type == float:
        return random() * 10000
    # elif type == datetime:
    #     return datetime.now()
    elif type == bytes:
        return randbytes(50)
    elif type == bool:
        return choice([True, False])
    elif type == list:
        return [random_data(include_iterables=False) for _ in range(randint(1, 50))]
    elif type == tuple:
        return tuple(random_data(include_iterables=False) for _ in range(randint(1, 50)))
    elif type == dict:
        return {random_data(key=True, include_iterables=False): random_data(include_iterables=False)
                for _ in range(randint(1, 50))}
    elif type == None:
        return None

def random_container() -> Container:
    containers = [Box, Directory, KeySet, Sequence, PairSet, PairMap, Property, Group]
    return choice(containers)()

def test():
    store = LmdbStore()
    database = Database(store=store)
    directory = Directory(database=database)
    # String keys of length 469 or more will crash LMDB.
    for i in range(1, 500):
        directory.set("".join(choices(ascii_lowercase, k=i)), random_data())

# print(generate_filled_database().dump())
test()
