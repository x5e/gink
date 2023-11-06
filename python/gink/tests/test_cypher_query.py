from gink.impl.cypher_query import CypherNode
from gink.impl.lmdb_store import LmdbStore
from gink.impl.database import Database
from gink.impl.graph import Graph

def test_create():
    store = LmdbStore()
    database = Database(store)
    graph = Graph(database)

    query = "CREATE (u:User {name: 'John'})-[b:Bought]->(i:Item) RETURN u"
    builder = graph.query(query)

    assert len(builder.create.root_nodes) == 1
    node = builder.create.root_nodes[0]
    assert isinstance(node, CypherNode)
    assert node.variable == 'u'
    assert node.label == 'User'
    assert node.properties == {'name': 'John'}
    assert node.rel and node.rel.next_node
    assert builder.to_string() == "CREATE (u:User{name: 'John'})-[b:Bought]->(i:Item) RETURN (u)"

def test_match():
    store = LmdbStore()
    database = Database(store)
    graph = Graph(database)

    query = "MATCH (u)-[r]->(b) RETURN u, r, b"
    builder = graph.query(query)

    assert len(builder.match.root_nodes) == 1
    node: CypherNode = builder.match.root_nodes[0]
    assert node.label is None
    assert node.variable == "u"
    assert node.rel.variable == "r"
    assert node.rel.next_node.variable == "b"
    assert builder.to_string() == "MATCH (u)-[r]->(b) RETURN (u, r, b)"
    assert builder.return_.to_string() == "RETURN (u, r, b)" 

    # Testing Delete and matching multiple nodes
    query = "MATCH (u:User), (b:Bot) DELETE u, b"
    builder = graph.query(query)
    assert len(builder.match.root_nodes) == 2
    for root_node in builder.match.root_nodes:
        assert root_node.variable and root_node.label
    assert len(builder.delete.deleting) == 2
    assert builder.to_string() == "MATCH (u:User), (b:Bot) DELETE (u, b)"
    
def test_where():
    store = LmdbStore()
    database = Database(store)
    graph = Graph(database)
    
    query = "MATCH (u)-[r]->(b) WHERE u.username = 'test' AND u.email = 'test@email.com' OR u.fname = 'me' RETURN u"
    builder = graph.query(query)
    assert builder.where.variable == 'u'
    assert builder.where.property == 'username'
    assert builder.where.operator == '='
    assert builder.where.value == "'test'"
    assert builder.where.and_.property == 'email'
    assert builder.where.and_.value == "'test@email.com'"
    assert builder.where.or_.property == 'fname'
    assert builder.where.or_.value == "'me'"
    assert builder.to_string() == "MATCH (u)-[r]->(b) WHERE u.username = 'test' AND u.email = 'test@email.com' OR u.fname = 'me' RETURN (u)"


def test_set():
    store = LmdbStore()
    database = Database(store)
    graph = Graph(database)
    
    query = "MATCH (u) WHERE u.username = 'test' SET u.username = 'changed' SET u.email = 'changed@email.com' RETURN u"
    builder = graph.query(query)
    assert len(builder.set) == 2
    assert builder.set[0].variable == 'u'
    assert builder.set[0].property == 'username'
    assert builder.set[0].operator == '='
    assert builder.set[0].value == "'changed'"
    assert builder.set[1].property == 'email'
    assert builder.set[1].value == "'changed@email.com'"
    assert builder.to_string() == "MATCH (u) WHERE u.username = 'test' SET u.username = 'changed' SET u.email = 'changed@email.com' RETURN (u)"


