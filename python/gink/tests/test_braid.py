from contextlib import closing
from .. import *

def test_set_get():
    """ Test the basic set/get functionality of properties works as expected. """
    for store in [LmdbStore(), MemoryStore(), ]:
        with closing(store):
            database = Database(store=store)
            braid = Braid(database=database)
            c12 = Chain(1, 2)
            c34 = Chain(3, 4)
            braid.set(c12, 77)
            braid.set(c34, inf)
            assert braid.get(c12, None) == 77
            assert braid.get(c34, None) == inf
            assert braid.size() == 2
            dumped = braid.dumps()
            as_dict = dict(braid.items())
            assert as_dict == {c12: 77, c34: inf}, as_dict
            braid.delete(c12)
            assert braid.get(c12, None) == None
            assert braid.size() == 1
            as_dict2 = dict(braid.items())
            assert as_dict2 == {c34: inf}, as_dict2
            braid.set(c34, 9)
            assert braid.get(c34, None) == 9
            assert dict(braid.items()) == {c34: 9}
            eval(dumped)
            assert dict(braid.items()) == {c12: 77, c34: inf}
