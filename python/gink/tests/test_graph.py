from .. import *
from contextlib import closing


def test_basics():
    """ test that I can create new directories as well as proxies for existing ones """
    for store in [LmdbStore()]:
        with closing(store):
            db = Database(store)
            vertex = Vertex(database=db)
            verb = Verb()
            edge1 = verb.create_edge(vertex, vertex)
            edge2 = verb.create_edge(vertex, vertex)
            assert edge1 != edge2
            edge1.set_property_value_by_name("foo", 32)
            found1 = edge1.get_property_value_by_name("foo")
            assert found1 == 32
            found2 = edge2.get_property_value_by_name("foo")
            assert found2 is None
            assert vertex.is_alive()
            vertex.remove()
            assert not vertex.is_alive()
            edges = set(verb.get_edges())
            assert edges == {edge1, edge2}, edges
            edge1.remove()
            edges = set(verb.get_edges())
            assert edges == {edge2}

def test_to_from():
    store = LmdbStore()
    db = Database(store=store)
    bundler = Bundler()
    vertex1 = Vertex(bundler=bundler)
    vertex2 = Vertex(bundler=bundler)
    db.commit(bundler=bundler)
    verb = Verb()
    bundler = Bundler()
    edge12 = verb.create_edge(vertex1, vertex2, bundler=bundler)
    edge21 = verb.create_edge(vertex2, vertex1, bundler=bundler)
    db.commit(bundler=bundler)
    edges_from1 = set(vertex1.get_edges_from())
    assert edges_from1 == {edge12}, edges_from1
    edges_to = set(vertex1.get_edges_to())
    assert edges_to == {edge21}, edges_to
