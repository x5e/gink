import json
import timeit
from gink import *

def generate_json(file_path: str):
    """
    Generates a JSON file with a size of 1.68GB
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

def insert_json(file_path: str):
    """
    This can take a while depending on how much data is in the JSON file.
    """
    with open(file_path, 'r') as f:
        file = f.read()
    store = LmdbStore('example.db')
    db = Database(store)
    global_dir = Directory.get_global_instance(db)
    directory = Directory(db, contents=json.loads(file))
    # To make it easy to find this directory again
    global_dir.set("big_dir", directory)

def test_db():
    generate_json('large_file.json')
    print("file populated")
    insert_json('large_file.json')
    print("done!")

print(timeit.timeit(test_db()))