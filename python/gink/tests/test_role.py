from .. import *
from contextlib import closing

def test_basics():
    """ Test the basic include/exclude functionality of groups works as expected. """
    for store in [LmdbStore(), MemoryStore(), ]:
        with closing(store):
            store = LmdbStore()
            database = Database(store=store)
            gd = Directory.get_global_instance(database=database)
            ad = Directory()
            group = Group()
            assert gd not in group
            group.include(gd)
            assert gd in group
            mark = generate_timestamp()
            assert not group.contains(gd, as_of=-1)
            group.include(ad)
            assert len(group) == 2
            assert group.size(as_of=-1) == 1
            members = set(group.get_members())
            assert members == {ad, gd}
            group.exclude(gd)
            assert group.get_members() == {ad}
            group.reset(mark)
            assert group.get_members() == {gd}
