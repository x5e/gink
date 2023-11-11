from datetime import datetime
from pathlib import Path
from gink import *

def test_write_fresh(count: int):
    """
    Test writes per second writing to an empty database.
    """
    directory = Directory(muid=Muid(1, 2, 3))
    before_time = datetime.utcnow()
    print("Testing Gink writing performance to fresh database")
    print("Writing", count, "entries.")
    for i in range(0, count):
        directory.set(f"test{i}", "test data to be inserted")
    after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    writes_per_second = count/total_time
    print("- Total time:", total_time, "seconds")
    print("- Writes per second:", round(writes_per_second, 2))

def test_read(count: int):
    """
    Tests reads per second, or how long it takes to read
    all entries populated by the write test.
    """
    directory = Directory(muid=Muid(1, 2, 3))
    print("Testing Gink reading performance")
    print("Reading", count, "entries.")
    before_time = datetime.utcnow()
    for i in range(0, count):
        assert directory.get(f"test{i}")
    after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    reads_per_second = count/total_time
    print("- Total time:", total_time, "seconds")
    print("- Reads per second:", round(reads_per_second, 2))
    
def test_db(count: int):
    test_write_fresh(count)
    print()
    test_read(count)

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
