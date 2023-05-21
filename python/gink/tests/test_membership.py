from .. import *
from contextlib import closing

def test_basics():
    """ Test the basic include/exclude functionality of memberships works as expected. """
    for store in [LmdbStore(), MemoryStore(), ]:
        with closing(store):
            store = LmdbStore()
            database = Database(store=store)
            gd = Directory.get_global_instance(database=database)
            ad = Directory()
            membership = Membership()
            assert gd not in membership
            membership.include(gd)
            assert gd in membership
            mark = database.get_now()
            assert not membership.contains(gd, as_of=-1)
            membership.include(ad)
            assert len(membership) == 2
            assert membership.size(as_of=-1) == 1
            members = set(membership.get_members())
            assert members == {ad, gd}
            membership.exclude(gd)
            assert membership.get_members() == {ad}
            membership.reset(mark)
            assert membership.get_members() == {gd}
