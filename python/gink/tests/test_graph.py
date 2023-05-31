from .. import *
from contextlib import closing


def test_basics():
    """ test that I can create new directories as well as proxies for existing ones """
    for store in [LmdbStore()]:
        with closing(store):
            db = Database(store)
            the = Noun()
            verb = Verb()
            edge = verb.create_edge(the, the)
            edge = verb.create_edge(the, the)
            print(repr(edge))
            print("---------------------")
            print(edge.dumps())
            print("---------------------")
            print(edge.dumps(False))
            print("---------------------")
            print(edge.dumps(2))
            print("---------------------")
            verb.create_edge(Noun.get_global_instance(), the)
            print(verb.dumps())

if __name__ == "__main__":
    test_basics()
