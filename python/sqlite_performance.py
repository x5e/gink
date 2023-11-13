import sqlite3
import random
from datetime import datetime

def test_write_fresh(count: int):
    """
    Test writes per second writing to an empty database.
    Commits to the database for every write.
    """
    with sqlite3.connect("file::memory:") as con:
        cur = con.cursor()
        cur.execute("CREATE TABLE test(test)")

        print("Testing SQLite writing performance to fresh database - each entry committed individually.")
        print("Writing", count, "entries...")
        before_time = datetime.utcnow()
        for i in range(0, count):
            cur.execute(f"""INSERT INTO test VALUES ('test{i} data to be inserted')""")
            con.commit()
        after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    writes_per_second = count/total_time
    print("- Total time:", total_time, "seconds")
    print("- Writes per second:", round(writes_per_second, 2))
    print()

def test_write_big_commit(count: int):
    """
    Test writes per second writing to an empty database.
    Bundles all transactions into one commit.
    """
    with sqlite3.connect("file::memory:") as con:
        cur = con.cursor()
        cur.execute("CREATE TABLE test(test)")

        print("Testing SQLite writing performance to fresh database - all entries in one commit.")
        print("Writing", count, "entries...")
        before_time = datetime.utcnow()
        for i in range(0, count):
            cur.execute(f"""INSERT INTO test VALUES ('test{i} data to be inserted')""")
        # Instead of individual commits, bundle all transactions into one commit.
        con.commit()
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
    with sqlite3.connect("file::memory:") as con:
        cur = con.cursor()
        cur.execute("CREATE TABLE test(test)")

        for i in range(0, count):
            cur.execute(f"""INSERT INTO test VALUES ('test{i} data to be inserted')""")
            con.commit()

        print("Testing SQLite writing performance to occupied database with", count, "existing entries.")
        print("Writing", count, "entries...")
        before_time = datetime.utcnow()
        for i in range(count, count*2):
            cur.execute(f"""INSERT INTO test VALUES ('test{i} data to be inserted')""")
            con.commit()
        after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    writes_per_second = count/total_time
    print("- Total time:", total_time, "seconds")
    print("- Writes per second:", round(writes_per_second, 2))
    print()

def test_read(count: int):
    """
    Tests reads per second, or how long it takes to read
    'count' entries.
    """
    with sqlite3.connect("file::memory:") as con:
        cur = con.cursor()
        cur.execute("CREATE TABLE test(test)")

        print(f"Testing SQLite reading performance database with {count} entries.")
        print("Populating database...")
        for i in range(0, count):
            cur.execute(f"""INSERT INTO test VALUES ('test{i} data to be inserted')""")
        con.commit()
        
        print("Reading", count, "entries...")
        before_time = datetime.utcnow()
        for i in range(0, count):
            assert cur.execute(f"""SELECT test FROM test WHERE test='test{i} data to be inserted'""").fetchone()
        after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    reads_per_second = count/total_time
    print("- Total time:", total_time, "seconds")
    print("- Reads per second:", round(reads_per_second, 2))
    print()

def test_read_write(count:int):
    """
    Tests transactions per second while writing then reading.
    """
    with sqlite3.connect("file::memory:") as con:
        cur = con.cursor()
        cur.execute("CREATE TABLE test(test)")

        print("Testing SQLite writing and reading performance to fresh database - each entry is committed individually.")
        print("Writing then reading", count, "entries...")
        before_time = datetime.utcnow()
        for i in range(0, count):
            cur.execute(f"""INSERT INTO test VALUES ('test{i} data to be inserted')""")
            con.commit()
            assert cur.execute(f"""SELECT test FROM test WHERE test='test{i} data to be inserted'""").fetchone()
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
def test_random_read(count: int):
    """
    Tests reading random entries in a directory and sequence of
    'count' size. Reads 100 random entries.
    """
    with sqlite3.connect("file::memory:") as con:
        cur = con.cursor()
        cur.execute("CREATE TABLE test(test)")

        print(f"Testing SQLite random reading performance database with {count} entries.")
        print("Populating database...")
        for i in range(0, count):
            cur.execute(f"""INSERT INTO test VALUES ('test{i} data to be inserted')""")
        con.commit()

        random_numbers = [random.randint(0, count-1) for _ in range(0, 1000)]

        print("Reading 1000 random entries...")
        before_time = datetime.utcnow()
        for i in random_numbers:
            assert cur.execute(f"""SELECT test FROM test WHERE test='test{i} data to be inserted'""").fetchone()
        after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    reads_per_second = count/total_time
    print("- Total time:", total_time, "seconds")
    print("- Reads per second:", round(reads_per_second, 2))
    print()

def test_as_db_increases(count: int):
    """
    Tests write and read performance 5 times, as the database size
    continues to increase by 'count'.

    For example, passing 10,000 as the count will test database write and
    read performance at 10,000, 20,000, 30,000, 40,000, then 50,000 entries.
    """

def test_all(count: int):
    test_write_fresh(count)
    test_read(count)
    test_write_occupied(count)
    test_read_write(count)
    test_delete(count)
    test_random_read(count)
    test_as_db_increases(count)

if __name__ == "__main__":
    from argparse import ArgumentParser, Namespace
    
    parser: ArgumentParser = ArgumentParser(allow_abbrev=False)
    parser.add_argument("-c", "--count", help="number of records", type=int, default=100)
    parser.add_argument("-g", "--sqlite", help="path to sqlite db", default="sqlite.db")

    help_tests = """
    Each test has an isolated instance of a store,
    so each test may be run independently.

    Specific tests to run:

    write_fresh
    write_big_commit
    write_occupied
    read
    read_write
    delete
    random_read
    increasing
    """
    choices_tests = ["write_fresh", "write_big_commit", "write_occupied", "read", "read_write", "delete", "random_read", "increasing"]
    parser.add_argument("-t", "--tests", help=help_tests, nargs="+", choices=choices_tests, default="all")
    args: Namespace = parser.parse_args()

    if args.tests == "all":
        test_all(args.count)
    else:
        if "write_fresh" in args.tests:
            test_write_fresh(args.count)
        if "write_big_commit" in args.tests:
            test_write_big_commit(args.count)
        if "write_occupied" in args.tests:
            test_write_occupied(args.count)
        if "read" in args.tests:
            test_read(args.count)
        if "read_write" in args.tests:
            test_read_write(args.count)
        if "delete" in args.tests:
            test_delete(args.count)
        if "random_read" in args.tests:
            test_random_read(args.count)
        if "increasing" in args.tests:
            test_as_db_increases(args.count)