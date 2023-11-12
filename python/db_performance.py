from datetime import datetime
from gink import *

def test_write_fresh(count: int):
    """
    Test writes per second writing to an empty database.
    """
    with LmdbStore() as store:
        db = Database(store)
        directory = Directory(db, muid=Muid(1, 2, 3))
        before_time = datetime.utcnow()
        print("Testing Gink writing performance to fresh database.")
        print("Writing", count, "key, value entries...")
        for i in range(0, count):
            directory.set(f"test{i}", "test data to be inserted")
        after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    writes_per_second = count/total_time
    print("- Total time:", total_time, "seconds")
    print("- Writes per second:", round(writes_per_second, 2))
    print()

def test_write_occupied(count: int):
    """
    Tests writes per second on a database that already has data.
    This test is similar to write_fresh, but the timer doesn't start
    until the second round of inserts.
    """
    with LmdbStore() as store:
        db = Database(store)
        directory = Directory(db, muid=Muid(1, 2, 3))
        
        print("Testing Gink writing performance to occupied database with", count, "entries.")
        print("Filling fresh database with key, value entries...")
        for i in range(0, count):
            directory.set(f"test{i}", "test data to be inserted")

        print("Testing: Writing", count, "new key, value entries...")
        before_time = datetime.utcnow()
        for i in range(count, count+10000):
            directory.set(f"test{i}", "test data to be inserted")
        after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    writes_per_second = 10000/total_time
    print("- Total time:", total_time, "seconds")
    print("- Writes per second:", round(writes_per_second, 2))
    print()

def test_read(count: int):
    """
    Tests reads per second, or how long it takes to read
    'count' entries.
    """
    with LmdbStore() as store:
        db = Database(store)
        directory = Directory(db, muid=Muid(1, 2, 3))
        print("Filling fresh database with key, value entries...")
        for i in range(0, count):
            directory.set(f"test{i}", "test data to be inserted")

        print("Testing Gink reading performance")
        print("Reading", count, "key,value entries...")
        before_time = datetime.utcnow()
        for i in range(0, count):
            assert directory.get(f"test{i}")
        after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    reads_per_second = count/total_time
    print("- Total time:", total_time, "seconds")
    print("- Reads per second:", round(reads_per_second, 2))
    print()

def test_sequence_append(count: int):
    """
    Tests appends per second in a sequence in a fresh database.
    """
    with LmdbStore() as store:
        db = Database(store)
        seq = Sequence(db, muid=Muid(2, 2, 3))
        print("Testing Gink Sequence append performance")
        print("Appending", count, "entries...")
        before_time = datetime.utcnow()
        for i in range(0, count):
            seq.append(f"test{i}")
        after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    appends_per_second = count/total_time
    print("- Total time:", total_time, "seconds")
    print("- Appends per second:", round(appends_per_second, 2))
    print()

def test_read_write(count:int):
    """
    Tests transactions per second while writing then reading.
    """
    with LmdbStore() as store:
        db = Database(store)
        directory = Directory(db, muid=Muid(1, 2, 3))
        print("Testing Gink write/read performance")
        print("Writing then reading", count,"entries...")
        before_time = datetime.utcnow()
        for i in range(0, count):
            directory.set(f"test{i}wr", "test data to be inserted")
            assert directory.get(f"test{i}wr")
        after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    txns_per_second = count/total_time
    print("- Total time:", total_time, "seconds")
    print("- Transactions per second:", round(txns_per_second, 2))
    print()

def test_delete(count: int):
    """
    Tests deletion performance.
    """
    with LmdbStore() as store:
        db = Database(store)
        directory = Directory(db, muid=Muid(1, 2, 3))
        print("Testing Gink delete performance")
        print("Filling fresh database with key, value entries to be deleted.")
        for i in range(0, count):
            directory.set(f"test{i}", "test data to be inserted")
        print("Deleting", count, "entries...")
        before_time = datetime.utcnow()
        for i in range(0, count):
            assert directory.delete(f"test{i}")
        after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    updates_per_second = count/total_time
    print("- Total time:", total_time, "seconds")
    print("- Deletes per second:", round(updates_per_second, 2))
    print()

    
def test_all(count: int):
    test_write_fresh(count)
    test_read(count)
    test_write_occupied(count)
    test_sequence_append(count)
    test_read_write(count)
    test_delete(count)

if __name__ == "__main__":
    from argparse import ArgumentParser, Namespace
    
    parser: ArgumentParser = ArgumentParser(allow_abbrev=False)
    parser.add_argument("-c", "--count", help="number of records", type=int, default=100)
    parser.add_argument("-g", "--gink", help="path to gink db", default="gink.db")

    help_tests = """
    Each test has an isolated instance of a store,
    so each test may be run independently.

    Specific tests to run:

    write_fresh
    write_occupied
    sequence_append
    read
    read_write
    delete
    """
    choices_tests = ["write_fresh", "write_occupied", "sequence_append", "read", "read_write", "delete"]
    parser.add_argument("-t", "--tests", help=help_tests, nargs="+", choices=choices_tests, default="all")
    args: Namespace = parser.parse_args()

    if args.tests == "all":
        test_all(args.count)
    else:
        if "write_fresh" in args.tests:
            test_write_fresh(args.count)
        if "write_occupied" in args.tests:
            test_write_occupied(args.count)
        if "sequence_append" in args.tests:
            test_sequence_append(args.count)
        if "read" in args.tests:
            test_read(args.count)
        if "read_write" in args.tests:
            test_read_write(args.count)
        if "delete" in args.tests:
            test_delete(args.count)
