""" Runs the store tests against the memory store. """

from .test_store import *
from ..impl.memory_store import MemoryStore
from ..impl.database import Database
from ..impl.property import Property
from ..impl.directory import Directory
from ..impl.sequence import Sequence

install_tests(globals(), globals(), MemoryStore)

def test_get_by_name():
    store = MemoryStore()
    db = Database(store)
    root = Directory(arche=True)
    prop = Property.get_global_instance()
    prop.set(root, "root")
    new_dir = Directory(database=db)
    prop.set(new_dir, "new_dir")
    assert len(list(store.get_by_name("root"))) == 1
    assert len(list(store.get_by_name("new_dir"))) == 1
    prop.set(Sequence(arche=True), "root")
    assert len(list(store.get_by_name("root"))) == 2
    prop.delete(Sequence(arche=True))
    assert len(list(store.get_by_name("root"))) == 1
    prop.delete(root)
    assert len(list(store.get_by_name("root"))) == 0


if __name__ == "__main__":
    print(dir())
