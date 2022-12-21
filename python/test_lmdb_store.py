""" Runs the store tests against the memory store. """
import os
from contextlib import closing

from google.protobuf.text_format import Parse

from change_set_pb2 import ChangeSet as ChangeSetBuilder

from lmdb_store import LmdbStore
from muid import Muid
import test_store
from test_store import install_tests  # pylint complains about test_store.install_tests

TEST_FILE = "/tmp/test.gink.mdb"

def maker():
    """ makes a file for testing """
    if os.path.exists(TEST_FILE):
        os.unlink(TEST_FILE)
    return LmdbStore(TEST_FILE)

install_tests(globals(), test_store, maker)

def test_get_ordered_entries(store_maker = maker):
    textproto1 = """
        medallion: 789
        chain_start: 123
        timestamp: 123
        changes {
            key: 1
            value {
                container {
                    behavior: QUEUE
                }
            }
        }
        changes {
            key: 2
            value {
                entry {
                    behavior: QUEUE
                    container { offset: 1 }
                    pointee { offset: 1 }
                }
            }
        }
        changes {
            key: 3
            value {
                entry {
                    behavior: QUEUE
                    container { offset: 1 }
                    value { characters: "Hello, World!" }
                }
            }
        }
        changes {
            key: 4
            value {
                entry {
                    behavior: QUEUE
                    container { offset: 1 }
                    value { characters: "Goodbye, World!" }
                }
            }
        }
    """
    textproto2 = """
        medallion: 789
        chain_start: 123
        timestamp: 234
        previous_timestamp: 123
        changes {
            key: 1
            value {
                exit {
                    container { timestamp: 123 offset: 1 }
                    entry { timestamp: 123 offset: 2 }
                }
            }
        }
        changes {
            key: 2
            value {
                exit {
                    container { timestamp: 123 offset: 1 }
                    entry { timestamp: 123 offset: 4 }
                    dest: 120
                }
            }
        }
    """
    with closing(store_maker()) as store:
        change_set_builder = ChangeSetBuilder()
        Parse(textproto1, change_set_builder) # type: ignore
        serialized = change_set_builder.SerializeToString() # type: ignore
        store.add_commit(serialized)
        assert isinstance(store, LmdbStore)
        found = [_ for _ in store.get_ordered_entries(container=Muid(123, 789, 1), as_of=124)]
        assert found[0].entry_muid == Muid(123, 789, 2)
        assert found[1].entry_muid == Muid(123, 789, 3)
        assert found[2].entry_muid == Muid(123, 789, 4)
        gotten = store.get_entry(Muid(123, 789, 1), Muid(123, 789, 4), as_of=124)
        assert gotten is not None
        assert gotten.address == Muid(123, 789, 4)
        assert gotten.builder.value.characters == "Goodbye, World!" # type: ignore

        change_set_builder2 = ChangeSetBuilder()
        Parse(textproto2, change_set_builder2) # type: ignore
        serialized2 = change_set_builder2.SerializeToString() # type: ignore
        store.add_commit(serialized2)
        found = [_ for _ in store.get_ordered_entries(container=Muid(123, 789, 1), as_of=124)]
        assert len(found) == 3
        assert found[0].entry_muid == Muid(123, 789, 2)
        assert found[1].entry_muid == Muid(123, 789, 3)
        assert found[2].entry_muid == Muid(123, 789, 4)
        found = [_ for _ in store.get_ordered_entries(container=Muid(123, 789, 1), as_of=235)]
        assert len(found) == 2
        assert found[0].entry_muid == Muid(123, 789, 4)
        assert found[1].entry_muid == Muid(123, 789, 3), found

if __name__ == "__main__":
    test_get_ordered_entries()