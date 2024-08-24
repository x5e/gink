from .. import *
from contextlib import closing
from io import StringIO


def test_basics():
    """ test that I can create new directories as well as proxies for existing ones """
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            db = Database(store)
            vertex = Vertex(database=db)
            edge_type = EdgeType()
            edge1 = edge_type.create_edge(vertex, vertex)
            edge2 = edge_type.create_edge(vertex, vertex)
            assert edge1 != edge2
            edge1.set_property_value_by_name("foo", 32)
            found1 = edge1.get_property_value_by_name("foo")
            assert found1 == 32
            found2 = edge2.get_property_value_by_name("foo")
            assert found2 is None
            assert vertex.is_alive()
            vertex.remove()
            assert not vertex.is_alive()
            edges = set(edge_type.get_edges())
            assert edges == {edge1, edge2}, edges
            edge1.remove()
            edges = set(edge_type.get_edges())
            assert edges == {edge2}

def test_to_from():
    for store in [LmdbStore()]:
        with closing(store):
            db = Database(store=store)
            bundler = Bundler()
            vertex1 = Vertex(bundler=bundler)
            vertex2 = Vertex(bundler=bundler)
            db.bundle(bundler=bundler)
            edge_type = EdgeType()
            bundler = Bundler()
            edge12 = edge_type.create_edge(vertex1, vertex2, bundler=bundler)
            edge21 = edge_type.create_edge(vertex2, vertex1, bundler=bundler)
            db.bundle(bundler=bundler)
            edges_from1 = set(vertex1.get_edges_from())
            assert edges_from1 == {edge12}, edges_from1
            edges_to = set(vertex1.get_edges_to())
            assert edges_to == {edge21}, edges_to

def test_ordered_edges():
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            db = Database(store)
            vertex1 = Vertex(database=db)
            vertex2 = Vertex(database=db)
            edge_type = EdgeType(database=db)
            edge1 = edge_type.create_edge(vertex1, vertex2, "hello")
            timestamp = generate_timestamp()
            edge_type.create_edge(vertex1, vertex2, "beautiful")
            edge_type.create_edge(vertex1, vertex2, "world", timestamp)
            messages = [edge.get_value() for edge in edge_type.get_edges()]
            assert messages == ["hello", "world", "beautiful"], messages
            edge1.move(dest=generate_timestamp())
            messages = [edge.get_value() for edge in edge_type.get_edges()]
            assert messages == ["world", "beautiful", "hello"], messages

def test_reissue_properties():
    for store in [LmdbStore()]:
        with closing(store):
            db = Database(store)
            vertex1 = Vertex(database=db)
            vertex2 = Vertex(database=db)
            edge_type = EdgeType(database=db)
            edge1 = edge_type.create_edge(vertex1, vertex2, "hello")
            edge1.set_property_value_by_name("foo", "bar")
            edge1.set_property_value_by_name("foo", "baz")
            timestamp = generate_timestamp()
            edge1.set_property_value_by_name("foo", "bat")
            assert edge1.get_property_value_by_name("foo") == "bat"
            before_removed = list(vertex1.get_edges_from())
            assert len(before_removed) == 1, before_removed
            edge1.remove()
            after_removed = list(vertex1.get_edges_from())
            assert len(after_removed) == 0, after_removed
            bundler = Bundler()
            db.reset(to_time=timestamp, bundler=bundler)
            db.bundle(bundler)
            after_reset = list(vertex1.get_edges_from())
            assert len(after_reset) == 1, after_reset
            edge2 = after_reset[0]
            assert edge2.get_muid() != edge1.get_muid()
            val_after_reset = edge2.get_property_value_by_name("foo")
            assert val_after_reset == "baz", val_after_reset

def test_reset_vertex():
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            db = Database(store)
            vertex1 = Vertex(database=db)
            vertex2 = Vertex(database=db)
            edge_type = EdgeType(database=db)
            edge_type.create_edge(vertex1, vertex2)
            assert vertex1.is_alive()
            timestamp = generate_timestamp()
            vertex1.remove()
            assert not vertex1.is_alive()
            bundler = Bundler()
            vertex1.reset(timestamp, bundler=bundler)
            db.bundle(bundler)
            assert vertex1.is_alive()

def test_reset_edge():
    for store in [LmdbStore(), MemoryStore()]:
        with closing(store):
            db = Database(store)
            vertex1 = Vertex(database=db)
            vertex2 = Vertex(database=db)
            edge_type = EdgeType(database=db)
            edge1 = edge_type.create_edge(vertex1, vertex2)
            assert len(list(edge_type.get_edges())) == 1
            before_remove = generate_timestamp()
            edge1.remove()
            assert len(list(edge_type.get_edges())) == 0
            db.reset(before_remove)
            assert len(list(edge_type.get_edges())) == 1

def test_graph_dump_load():
    for store in [LmdbStore(), MemoryStore(), ]:
        with closing(store):
            db = Database(store)
            noun1 = Vertex(database=db)
            noun2 = Vertex(database=db)
            prop = Property(database=db)
            edge_type = EdgeType(database=db)
            edge1 = edge_type.create_edge(noun1, noun2, "edge1")
            edge2 = edge_type.create_edge(noun2, noun1, "edge2")
            prop.set(edge1, "edge1 property")
            prop.set(edge2, "edge2 property")
            str_io = StringIO()
            db.dump(file=str_io)
            dump = str_io.getvalue()

        store2 = LmdbStore()
        with closing(store2):
            db2 = Database(store2)
            exec(dump)
            after_load = StringIO()
            db2.dump(file=after_load)
            after_load = after_load.getvalue()
            assert "valued='edge1'" in after_load
            assert "valued='edge2'" in after_load
            assert "edge1 property" in after_load
            assert "edge2 property" in after_load

