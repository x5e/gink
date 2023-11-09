import json
from timeit import timeit
from gink import *

def generate_json(file_path: str):
    """
    Generates a JSON file with a size of 179MB if range is 500k
    or 1.68GB if range is set to 5 mil
    """
    with open(file_path, 'w') as f:
        test = {"test": {}}
        for i in range(0, 500000):#5000000
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
        f.write(json.dumps(test))
        del test

def insert_json(file_path: str):
    with open(file_path, 'r') as f:
        file = f.read()
    store = LmdbStore('example.db')
    db = Database(store)
    directory = Directory(db, contents=json.loads(file))

def test_db():
    generate_json('large_file.json')
    print("file populated")
    insert_json('large_file.json')
    print("done!\ntook", timeit("insert_json('large_file.json')", "from __main__ import insert_json", number=1), " seconds.")

if __name__ == "__main__":
    test_db()