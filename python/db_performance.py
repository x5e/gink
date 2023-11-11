from datetime import datetime
from gink import *

def test_write_fresh(count: int):
    """
    Test writes per second writing to an empty database.
    """
    directory = Directory(muid=Muid(1, 2, 3))
    before_time = datetime.utcnow()
    print("Testing Gink writing performance to fresh database")
    print("Writing", count, "entries...")
    for i in range(0, count):
        directory.set(f"test{i}", "test data to be inserted")
    after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    writes_per_second = count/total_time
    print("- Total time:", total_time, "seconds")
    print("- Writes per second:", round(writes_per_second, 2))

def test_write_occupied(count: int):
    """
    Tests writes per second on a database that already has data 
    This test uses the database from the previous write test,
    so the amount of data already included is based on the count
    argument passed in the command line.

    This just writes 2000 new entries for now. The idea is testing how
    the write speed compares to a fresh database, so the number shouldn't
    matter too much.
    """
    directory = Directory(muid=Muid(1, 2, 3))
    before_time = datetime.utcnow()
    print("Testing Gink writing performance to occupied database with", count, "entries.")
    print("Writing 2000 new entries...")
    for i in range(count, count+2000):
        directory.set(f"test{i}", "test data to be inserted")
    after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    writes_per_second = 2000/total_time
    print("- Total time:", total_time, "seconds")
    print("- Writes per second:", round(writes_per_second, 2))

def test_read(count: int):
    """
    Tests reads per second, or how long it takes to read
    all entries populated by the write test.
    """
    directory = Directory(muid=Muid(1, 2, 3))
    print("Testing Gink reading performance")
    print("Reading", count, "entries...")
    before_time = datetime.utcnow()
    for i in range(0, count):
        assert directory.get(f"test{i}")
    after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    reads_per_second = count/total_time
    print("- Total time:", total_time, "seconds")
    print("- Reads per second:", round(reads_per_second, 2))

def test_sequence_append(count: int):
    """
    Tests appends per second in a sequence.
    Note: this test runs after the database is already populated
    in test_db().
    """
    seq = Sequence(muid=Muid(2, 2, 3))
    print("Testing Gink Sequence append performance")
    print("Appending", count, "entries...")
    before_time = datetime.utcnow()
    for i in range(0, count):
        assert seq.append(f"test{i}")
    after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    appends_per_second = count/total_time
    print("- Total time:", total_time, "seconds")
    print("- Appends per second:", round(appends_per_second, 2))
    
def test_db(count: int):
    test_write_fresh(count)
    print()
    test_read(count)
    print()
    test_write_occupied(count)
    print()
    test_sequence_append(count)

if __name__ == "__main__":
    from argparse import ArgumentParser, Namespace
    
    parser: ArgumentParser = ArgumentParser(allow_abbrev=False)
    parser.add_argument("-c", "--count", help="number of records", type=int, default=10)
    parser.add_argument("-g", "--gink", help="path to gink db", default="gink.db")
    args: Namespace = parser.parse_args()

    with LmdbStore(args.gink) as store:
        db = Database(store)
        # I'm setting the database and store here because the directories
        # will use Database.get_last().
        test_db(count=args.count)
