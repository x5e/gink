# Examples
## Data Structure Operations

Note: there are some operations that are available to all Containers, which are shown at the [end of this page](#all-containers).\
<br>
For all operations, a store and a database are needed:
```python
from gink import *
store = LmdbStore('example.db')
database = Database(store=store)
```

### Box
A Box (view docs) is the simplest data structure available on Gink. It can hold only one value at a time; you can set its value, or get its value.
```python
box = Box(database=database)

box.set({"foo": "bar", "key2": 15})
result = box.get() # Returns the python dictionary just added

if not box.isEmpty():
    print(box.size()) # This will only return 0 or 1 (1 in this case).
```

### Directory
The Directory aims to mimic the functionality of a Python dictionary. If you know how to use a dictionary, you should already know how to use the directory!
```python
directory = Directory(database=database)

directory["key1"] = "value1"

# Saves a timestamp after "key1" and before "key2"
time = database.get_now()

# Achieves the same thing as the previous set, just different syntax.
directory.set("key2", {"test": "document"})

result = directory.get("key2") # Returns {"test": "document"}
result2 = directory.get("key3") # Returns None

# Returns an generator of ["key1", "key2"]
keys = directory.keys()

# Returns the items as a generator of (key, value tuples) in the directory
# at the specified timestamp - in this case, [("key1", "value1")]
items = directory.items(as_of=time)

# Returns "value1" and removes the key: value pair from the directory.
value = directory.pop("key1")
```

### Sequence
The Sequence is equivalent to a Python list. Again, these operations should look pretty familiar! In a Gink Sequence, the contents are ordered by timestamps.
```python
sequence = Sequence()

sequence.append("Hello, World!")
sequence.append(42)
sequence.append("a")
sequence.append("b")

# Returns 0
found = sequence.index("Hello, World!")

# Returns 42
popped = sequence.pop(1)

# Pops and returns the value at index 0, which is "Hello, World!"
# The destination argument allows you to place the item
# back into the sequence at a different timestamp
# in this case, -1 would indicate the timestamp of the last change.
# So, this sequence is now ordered as ["a", "b", "Hello, World!"]
popped = sequence.pop(0, dest=-1)


# Inserts "x" at index 1, between "a" and "b", in this example.
# Comment is an optional parameter that will be included in
# bundle for this change (most operations may contain comments).
sequence.insert(1, "x", comment="insert x")

# Convert contents to Python list
as_list = list(sequence)
```

### Key Set

### Pair Set

### Pair Map

### Role

### Property

### Noun

### Verb

(all-containers)=
### All Containers
The container is the parent class for all of these data structures. Here are some examples of the powerful operations you can do with any container:
```python
# reset
# as_of
# bundler/comment stuff
# clear
```
