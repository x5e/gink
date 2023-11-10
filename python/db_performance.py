from json import *
from timeit import timeit
from pathlib import Path
from gink import *

def generate_json(file_path: str, count: int):
    """
    Generates a JSON file with a size of 179MB if range is 500k
    or 1.68GB if range is set to 5 mil
    """
    with open(file_path, 'w') as file_handle:
        test = {"test": {}}
        for i in range(0, count):
            test['test'][f'test{i}'] = {
                "testData1": "14239081741847918471481",
                "testData2": "14239081741847918471481",
                "testData3": "14239081741847918471481",
                "testData4": "14239081741847918471481",
                "testData5": "14239081741847918471481",
                "testData6": "14239081741847918471481",
                "testData7": "14239081741847918471481",
                "testData8": "14239081741847918471481",
                "testData9": "14239081741847918471481"
                }
        dump(test, file_handle, indent=1)
        del test

def insert_json(path_to_json_file: Path, path_to_gink_db: Path) -> int:
    with open(path_to_json_file, 'r') as f:
        file = f.read()
    store = LmdbStore(path_to_gink_db)
    db = Database(store)
    directory = Directory(db, contents=loads(file))
    return directory.size()

def test_db(path_to_json_file: Path, path_to_gink_db: Path, count: int):
    generate_json(path_to_json_file, count)
    print("file populated")
    inserted = insert_json(path_to_json_file, path_to_gink_db=path_to_gink_db)
    print(f"done, inserted: {inserted}")
    #print("done!\ntook", timeit("insert_json('large_file.json')", "from __main__ import insert_json", number=1), " seconds.")

if __name__ == "__main__":
    from argparse import ArgumentParser, Namespace
    parser: ArgumentParser = ArgumentParser(allow_abbrev=False)
    parser.add_argument("-c", "--count", help="number of records", type=int, default=10)
    parser.add_argument("-j", "--json", help="path to json", default="test.json")
    parser.add_argument("-g", "--gink", help="path to gink db", default="gink.db")
    args: Namespace = parser.parse_args()
    test_db(path_to_json_file=args.json, path_to_gink_db=args.gink, count=args.count)
