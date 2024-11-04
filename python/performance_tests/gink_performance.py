from datetime import datetime
import random
import json
import os
from pathlib import Path
from gink import *

def test_write_fresh(db_file_path: Path, count: int) -> dict:
    """
    Test writes per second writing to an empty database.
    Bundles to database every bundle. Returns results as a
    dictionary.
    """
    with LmdbStore(db_file_path, True) as store:
        db = Database(store)
        directory = Directory(db, muid=Muid(1, 2, 3))
        print("Testing Gink Python writing performance to fresh database.")
        print("Writing", count, "key, value entries...")
        before_time = datetime.utcnow()
        for i in range(0, count):
            directory.set(f"test{i}", "test data to be inserted")
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

def test_write_big_bundle(db_file_path: Path, count: int) -> dict:
    """
    Test writes per second writing to an empty database.
    Bundles all writes into one big bundle.
    Returns results as a dictionary.
    """
    with LmdbStore(db_file_path, True) as store:
        db = Database(store)
        directory = Directory(db, muid=Muid(1, 2, 3))
        bundler = db.create_bundler("test")
        print("Testing Gink Python writing performance to fresh database in one bundle.")
        print("Writing", count, "key, value entries...")
        before_time = datetime.now()
        for i in range(0, count):
            directory.set(f"test{i}", "test data to be inserted", bundler=bundler)
        db.bundle(bundler)
        after_time = datetime.now()

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

def test_write_occupied(db_file_path: Path, count: int) -> dict:
    """
    Tests writes per second on a database that already has data.
    This test is similar to write_fresh, but the timer doesn't start
    until the second round of inserts.
    Returns results as a dictionary.
    """
    with LmdbStore(db_file_path, True) as store:
        db = Database(store)
        directory = Directory(db, muid=Muid(1, 2, 3))

        print("Testing Gink Python writing performance to occupied database with", count, "entries.")
        print("Filling fresh database with key, value entries...")
        for i in range(0, count):
            directory.set(f"test{i}", "test data to be inserted")

        print("Testing: Writing", count, "new key, value entries...")
        before_time = datetime.utcnow()
        for i in range(count, count*2):
            directory.set(f"test{i}", "test data to be inserted")
        after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    writes_per_second = 10000/total_time
    print("- Total time:", total_time, "seconds")
    print("- Writes per second:", round(writes_per_second, 2))
    print()

    results = {
            "total_time": total_time,
            "writes_per_second": writes_per_second
            }
    return results

def test_read(db_file_path: Path, count: int) -> dict:
    """
    Tests reads per second, or how long it takes to read
    'count' entries.
    Returns results as a dictionary.
    """
    with LmdbStore(db_file_path, True) as store:
        db = Database(store)
        directory = Directory(db, muid=Muid(1, 2, 3))
        print("Filling fresh database with key, value entries...")
        for i in range(0, count):
            directory.set(f"test{i}", "test data to be inserted")

        print("Testing Gink Python reading performance")
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

    results = {
            "total_time": total_time,
            "reads_per_second": reads_per_second
            }
    return results

def test_sequence_append(db_file_path: Path, count: int) -> dict:
    """
    Tests appends per second in a sequence in a fresh database.
    Returns results as a dictionary.
    """
    with LmdbStore(db_file_path, True) as store:
        db = Database(store)
        seq = Sequence(db, muid=Muid(2, 2, 3))
        print("Testing Gink Python Sequence append performance")
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

    results = {
            "total_time": total_time,
            "appends_per_second": appends_per_second
            }
    return results

def test_read_write(db_file_path: Path, count:int) -> dict:
    """
    Tests transactions per second while writing then reading.
    Returns results as a dictionary.
    """
    with LmdbStore(db_file_path, True) as store:
        db = Database(store)
        directory = Directory(db, muid=Muid(1, 2, 3))
        print("Testing Gink Python write/read performance")
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

    results = {
            "total_time": total_time,
            "txns_per_second": txns_per_second
            }
    return results

def test_delete(db_file_path: Path, count: int, retain: bool) -> dict:
    """
    Tests deletion performance.
    Returns results as a dictionary.
    """
    with LmdbStore(db_file_path, True, retain_bundles=retain, retain_entries=retain) as store:
        db = Database(store)
        directory = Directory(db, muid=Muid(1, 2, 3))
        print("Testing Gink Python delete performance")
        print("Filling fresh database with key, value entries to be deleted.")
        for i in range(0, count):
            directory.set(f"test{i}", "test data to be inserted")
        print("Deleting", count, "entries...")
        before_time = datetime.utcnow()
        for i in range(0, count):
            assert directory.delete(f"test{i}")
        after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    deletes_per_second = count/total_time
    print("- Total time:", total_time, "seconds")
    print("- Deletes per second:", round(deletes_per_second, 2))
    print()

    results = {
            "total_time": total_time,
            "deletes_per_second": deletes_per_second
            }
    return results

def test_random_read(db_file_path: Path, count: int) -> dict:
    """
    Tests reading random entries in a directory of 'count' size.
    Returns results as a dictionary.
    """
    how_many = 1000
    with LmdbStore(db_file_path, True) as store:
        db = Database(store)
        directory = Directory(db, muid=Muid(1, 2, 3))
        print("Testing Gink Python random read performance")
        print(f"Filling fresh directory with {count} entries.")
        for i in range(0, count):
            directory.set(f"test{i}", "test data to be inserted")

        random_numbers = [random.randint(0, count-1) for _ in range(0, how_many)]

        print(f"Reading {how_many} random entries.")
        before_time = datetime.utcnow()
        for i in random_numbers:
            assert directory.get(f"test{i}")
        after_time = datetime.utcnow()

    total_time = round((after_time - before_time).total_seconds(), 4)
    reads_per_second = how_many/total_time

    print("- Total time: ", total_time, "seconds")
    print("- Random reads per second: ", round(reads_per_second, 2))
    print()

    results = {
            "total_time": total_time,
            "reads_per_second": reads_per_second
            }
    return results

def test_increasing(db_file_path: Path, count: int, num_inc_tests: int) -> dict:
    """
    Tests write and read performance 5 times, as the database size
    continues to increase by 'count'.

    For example, passing 10,000 as the count will test database write and
    read performance at 10,000, 20,000, 30,000, 40,000, then 50,000 entries.
    Returns results as a dictionary.
    """
    with LmdbStore(db_file_path, True) as store:
        db = Database(store)
        directory = Directory(db, muid=Muid(1, 2, 3))
        current_entries = 0
        results = {}

        print("Testing Gink Python writing and reading performance as database size increases.")
        for r in range(1, num_inc_tests+1):
            print(f"Testing Gink Python writing performance to database with {current_entries} entries.")
            print("Writing", count, "key, value entries...")
            write_before_time = datetime.utcnow()
            for i in range(0, count):
                directory.set(f"test{i}", "test data to be inserted")
            write_after_time = datetime.utcnow()

            write_total_time = round((write_after_time - write_before_time).total_seconds(), 4)
            writes_per_second = count/write_total_time
            print(f"** For database starting at {current_entries} entries **")
            print("- Total write time:", write_total_time, "seconds")
            print("- Writes per second:", round(writes_per_second, 2))
            print()

            read_before_time = datetime.utcnow()
            for i in range(0, count):
                assert directory.get(f"test{i}")
            read_after_time = datetime.utcnow()

            read_total_time = round((read_after_time - read_before_time).total_seconds(), 4)
            reads_per_second = count/read_total_time
            print(f"** For database with {count*r} entries **")
            print("- Total read time:", read_total_time, "seconds")
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

def test_all(db_file_path: Path, count: int, num_inc_tests: int, retain_entries: bool):
    results = {}
    results["write_fresh"] = test_write_fresh(db_file_path, count)
    results["read"] = test_read(db_file_path, count)
    results["write_occupied"] = test_write_occupied(db_file_path, count)
    results["write_big_bundle"] = test_write_big_bundle(db_file_path, count)
    results["sequence_append"] = test_sequence_append(db_file_path, count)
    results["read_write"] = test_read_write(db_file_path, count)
    results["delete"] = test_delete(db_file_path, count, retain_entries)
    results["random_read"] = test_random_read(db_file_path, count)
    results["increasing"] = test_increasing(db_file_path, count, num_inc_tests)
    return results

if __name__ == "__main__":
    from argparse import ArgumentParser, Namespace

    parser: ArgumentParser = ArgumentParser(allow_abbrev=False)
    parser.add_argument("-c", "--count", help="number of records", type=int, default=100)
    parser.add_argument("-o", "--output", help="json file to save output. default to no file, stdout")
    parser.add_argument("-d", "--dir", help="directory for temporary database", default="./perf_test_temp", type=Path)
    parser.add_argument("-r", "--retain", help="retain entries and bundles in deletion test?", default=False, type=bool)
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
    write_big_bundle
    write_occupied
    sequence_append
    read
    read_write
    delete
    random_read
    increasing
    """
    choices_tests = ["write_fresh", "write_big_bundle","write_occupied", "sequence_append", "read", "read_write", "delete", "random_read", "increasing"]
    parser.add_argument("-t", "--tests", help=help_tests, nargs="+", choices=choices_tests, default="all")
    args: Namespace = parser.parse_args()
    try:
        os.mkdir(args.dir)
    except FileExistsError:
        pass
    db_path = os.path.join(args.dir, "gink.db")
    if args.tests == "all":
        results = test_all(db_path, args.count, args.increasing, args.retain)
    else:
        results = {}
        if "write_fresh" in args.tests:
            results["write_fresh"] = test_write_fresh(db_path, args.count)
        if "write_big_bundle" in args.tests:
            results["write_big_bundle"] = test_write_big_bundle(db_path, args.count)
        if "write_occupied" in args.tests:
            results["write_occupied"] = test_write_occupied(db_path, args.count)
        if "sequence_append" in args.tests:
            results["sequence_append"] = test_sequence_append(db_path, args.count)
        if "read" in args.tests:
            results["read"] = test_read(db_path, args.count)
        if "read_write" in args.tests:
            results["read_write"] = test_read_write(db_path, args.count)
        if "delete" in args.tests:
            results["delete"] = test_delete(db_path, args.count, args.retain)
        if "random_read" in args.tests:
            results["random_read"] = test_random_read(db_path, args.count)
        if "increasing" in args.tests:
            results["increasing"] = test_increasing(db_path, args.count, args.increasing)

    if args.output:
        try:
            # If file already exists, meaning tests have been run
            # on another database first.
            with open(args.output, 'r') as f:
                data = json.loads(f.read())
                data["gink_python"] = results
        except FileNotFoundError:
            # If this is the first test run.
            data = {"gink_python": results}

        with open(args.output, 'w') as f:
            f.write(json.dumps(data))
