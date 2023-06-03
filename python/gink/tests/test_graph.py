from .. import *
from contextlib import closing


def test_basics():
    """ test that I can create new directories as well as proxies for existing ones """
    for store in [LmdbStore()]:
        with closing(store):
            db = Database(store)
            noun = Noun(database=db)
            verb = Verb()
            edge1 = verb.create_edge(noun, noun)
            edge2 = verb.create_edge(noun, noun)
            assert edge1 != edge2
            edge1.set_property_value_by_name("foo", 32)
            found1 = edge1.get_property_value_by_name("foo")
            assert found1 == 32
            found2 = edge2.get_property_value_by_name("foo")
            assert found2 is None
            assert noun.is_alive()
            noun.remove()
            assert not noun.is_alive()
            edges = set(verb.get_edges())
            assert edges == {edge1, edge2}, edges
            edge1.remove()
            edges = set(verb.get_edges())
            assert edges == {edge2}


