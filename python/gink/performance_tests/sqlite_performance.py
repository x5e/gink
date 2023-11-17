import sqlite3
import random
import json
from datetime import datetime

def test_write_fresh(count: int) -> dict:
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

    results = {
            "total_time": total_time,
            "writes_per_second": writes_per_second
            }
    return results

def test_write_big_commit(count: int) -> dict:
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

    results = {
            "total_time": total_time,
            "writes_per_second": writes_per_second
            }
    return results

def test_write_occupied(count: int) -> dict:
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

    results = {
            "total_time": total_time,
            "writes_per_second": writes_per_second
            }
    return results

def test_read(count: int) -> dict:
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

    results = {
            "total_time": total_time,
            "reads_per_second": reads_per_second
            }
    return results

def test_read_write(count:int) -> dict:
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

    results = {
            "total_time": total_time,
            "txns_per_second": txns_per_second
            }
    return results

def test_delete(count: int) -> dict:
    """
    Tests deletion performance.
    """
    with sqlite3.connect("file::memory:") as con:
        cur = con.cursor()
        cur.execute("CREATE TABLE test(test)")

        print("Testing SQLite deleting performance to occupied database with", count, "existing entries.")
        print("Populating database with", count, "entries...")
        for i in range(0, count):
            cur.execute(f"""INSERT INTO test VALUES ('test{i} data to be inserted')""")
            con.commit()
        
        print("Deleting", count, "entries...")
        before_time = datetime.utcnow()
        for i in range(count, count*2):
            cur.execute(f"""DELETE FROM test WHERE test='test{i} data to be inserted'""")
            con.commit()
        after_time = datetime.utcnow()
        # Making sure entries were actually deleted.
        assert not cur.execute(f"""SELECT test FROM test WHERE test='test{count/2} data to be inserted'""").fetchone()

    total_time = round((after_time - before_time).total_seconds(), 4)
    deletes_per_second = count/total_time
    print("- Total time:", total_time, "seconds")
    print("- Deletions per second:", round(deletes_per_second, 2))
    print()

    results = {
            "total_time": total_time,
            "deletes_per_second": deletes_per_second
            }
    return results

def test_random_read(count: int) -> dict:
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

    results = {
            "total_time": total_time,
            "reads_per_second": reads_per_second
            }
    return results

def test_as_db_increases(count: int, num_inc_tests: int) -> dict:
    """
    Tests write and read performance 5 times, as the database size
    continues to increase by 'count'.

    For example, passing 10,000 as the count will test database write and
    read performance at 10,000, 20,000, 30,000, 40,000, then 50,000 entries.
    """
    with sqlite3.connect("file::memory:") as con:
        cur = con.cursor()
        cur.execute("CREATE TABLE test(test)")
        current_entries = 0
        results = {}

        print("Testing SQLite writing performance to a growing database - each entry will committed individually.")

        for r in range(1, num_inc_tests+1):
            print(f"Writing {count} entries to a database with {current_entries} existing entries...")
            before_time = datetime.utcnow()
            for i in range(0, count):
                cur.execute(f"""INSERT INTO test VALUES ('test{i} data to be inserted')""")
                con.commit()
            after_time = datetime.utcnow()

            write_total_time = round((after_time - before_time).total_seconds(), 4)
            writes_per_second = count/write_total_time
            print(f"** For database starting at {current_entries} entries **")
            print("- Total time:", write_total_time, "seconds")
            print("- Writes per second:", round(writes_per_second, 2))
            print()

            print(f"Reading {count} entries from a database with {count * r} existing entries...")
            before_time = datetime.utcnow()
            for i in range(0, count):
                assert cur.execute(f"""SELECT test FROM test WHERE test='test{i} data to be inserted'""").fetchone()
            after_time = datetime.utcnow()

            read_total_time = round((after_time - before_time).total_seconds(), 4)
            reads_per_second = count/read_total_time
            print(f"** For database with {count*r} entries **") 
            print("- Total time:", read_total_time, "seconds")
            print("- Reads per second:", round(reads_per_second, 2))
            print()

            results[count*r] = {
                "write": {
                    "total_time": write_total_time,
                    "writes_per_second": writes_per_second
                },
                "read": {
                    "total_time": read_total_time,
                    "reads_per_second": reads_per_second
                }
            }

            current_entries = count * r

        return results
    
def test_all(count: int, num_inc_tests: int) -> dict:
    results = {}
    results["write_fresh"] = test_write_fresh(count)
    results["read"] = test_read(count)
    results["write_occupied"] = test_write_occupied(count)
    results["write_big_commit"] = test_write_big_commit(count)
    results["read_write"] = test_read_write(count)
    results["delete"] = test_delete(count)
    results["random_read"] = test_random_read(count)
    results["increases"] = test_as_db_increases(count, num_inc_tests)
    return results

if __name__ == "__main__":
    from argparse import ArgumentParser, Namespace
    
    parser: ArgumentParser = ArgumentParser(allow_abbrev=False)
    parser.add_argument("-c", "--count", help="number of records", type=int, default=100)
    parser.add_argument("-d", "--database", help="path to sqlite database file", default="sqlite.db")
    parser.add_argument("-o", "--output", help="json file to save output. default to no file, stdout")
    help_increasing = """
    Number of intervals to run the increasing test.
    Max entries will be -> this flag * count.
    """
    parser.add_argument("-i", "--increasing", help=help_increasing, type=int, default=5)
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
        results = test_all(args.count, args.increasing)
    else:
        results = {}
        if "write_fresh" in args.tests:
            results["write_fresh"] = test_write_fresh(args.count)
        if "write_big_commit" in args.tests:
            results["write_big_commit"] = test_write_big_commit(args.count)
        if "write_occupied" in args.tests:
            results["write_occupied"] = test_write_occupied(args.count)
        if "read" in args.tests:
            results["read"] = test_read(args.count)
        if "read_write" in args.tests:
            results["read_write"] = test_read_write(args.count)
        if "delete" in args.tests:
            results["delete"] = test_delete(args.count)
        if "random_read" in args.tests:
            results["random_read"] = test_random_read(args.count)
        if "increasing" in args.tests:
            results["increases"] = test_as_db_increases(args.count, args.increasing)

    if args.output:
        try:
            # If file already exists, meaning tests have been run
            # on another database first.
            with open(args.output, 'r') as f:
                data = json.loads(f.read())
                data["sqlite_python"] = results
        except FileNotFoundError:
            # If this is the first test run.
            data = {"sqlite_python": results}

        with open(args.output, 'w') as f:
            f.write(json.dumps(data))
