from .. import *
from contextlib import closing

def test_basics():
    """ Test the basic include/exclude functionality of roles works as expected. """
    for store in [LmdbStore(), MemoryStore(), ]:
        with closing(store):
            store = LmdbStore()
            database = Database(store=store)
            gd = Directory.get_global_instance(database=database)
            ad = Directory()
            role = Role()
            assert gd not in role
            role.include(gd)
            assert gd in role
            mark = database.get_now()
            assert not role.contains(gd, as_of=-1)
            role.include(ad)
            assert len(role) == 2
            assert role.size(as_of=-1) == 1
            members = set(role.get_members())
            assert members == {ad, gd}
            role.exclude(gd)
            assert role.get_members() == {ad}
            role.reset(mark)
            assert role.get_members() == {gd}
