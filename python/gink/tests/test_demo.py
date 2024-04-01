from .. import *


def test_as_of():
    for store in [MemoryStore(), LmdbStore()]:
        with store:
            assert isinstance(store, AbstractStore)
            database = Database(store=store)
            root = Directory(arche=True, database=database)
            root["hello"] = "world"
            root["hello"] = "universe"
            assert root["hello"] == "universe"
            assert root.get("hello", as_of=-1) == "world"
            assert root.get("hello", as_of=-2) is None
            assert dict(root) == {"hello": "universe"}
            assert dict(root.items(as_of=-1)) == {"hello": "world"}, store
            assert dict(root.items(as_of=0)) == {}
            assert dict(root.items(as_of=1)) == {}
            at_two = dict(root.items(as_of=2))
            assert at_two == {"hello": "world"}, (at_two, store)
