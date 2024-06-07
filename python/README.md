# Gink in General

Gink aims to be a "protocol first" database system defined by the protocol for syncronizing
instances, rather than by a specific implementation. Defining the database in terms of
the interchange format allows for independent implementations to interact seamlessly in
a well-defined manner.

## Take a look at the full docs [here](https://gink.readthedocs.io/en/latest/).

I created the Python implementation of Gink to be a testbed for new ideas and
to provide the simplest expression of all the concepts in Gink.  Well written python
code can essentially serve as executable psudocode.  Code written for this implementation
has been biased in favor of readability and extensibility, rather than raw performance.
For example, the code doesn't use async functions or multi-threading.

* [Installation](#installation)
    * [Examples](#examples)
        * [Data Structures](#data-structures)
            * [Box](#box)
            * [Directory](#directory)
            * [Sequence](#sequence)
            * [All Containers](#all-containers)
        * [Database Operations](#database-operations)

## Installation
Assuming you have Python and Pip installed:
```sh
pip3 install gink
```

## Examples
This page does not include examples for all data structures. Take a look at our [Python documentation](https://gink.readthedocs.io/en/latest/) for all examples and full docs.

### Data Structures

There are some operations that are available to all Containers, which are shown at the [end of this page](#all-containers).\
\
For all operations, a store and a database are needed:
```py
from gink import *

store = LmdbStore('example.db')
database = Database(store=store)
```

#### Box
A Box is the simplest data structure available on Gink. It can hold only one value at a time; you can set its value, or get its value.

```py
box = Box(database=database)

box.set({"foo": "bar", "key2": 15})
result = box.get()  # Returns the python dictionary just added

if not box.is_empty():
    print(box.size())  # This will only return 0 or 1 (1 in this case).
```

#### Directory
The Directory aims to mimic the functionality of a Python dictionary. If you know how to use a dictionary, you should already know how to use the directory!\
\
Create a new directory:
```python
directory = Directory(database=database)
```
Set key: value pairs:
```py
directory["key1"] = "value1"

# Saves a timestamp after "key1" and before "key2"
time = database.get_now() # more on this in All Containers examples

# Achieves the same thing as the previous set, just different syntax.
directory.set("key2", {"test": "document"})
```
Getting the value of a key:
```py
result = directory["key1"] # Returns "value1"
result2 = directory.get("key2") # Returns {"test": "document"}
result3 = directory.get("key3") # Returns None
```
Get all keys and items:
```py
# Returns an generator of ["key1", "key2"]
# Note: the order may not be the same.
keys = directory.keys()

# Returns the items as a generator of (key, value tuples) in the directory
# at the specified timestamp - in this case, [("key1", "value1")]
items = directory.items(as_of=time)

# returns a list of all values
values = directory.values()
```
Deleting keys:
```py
# Returns "value1" and removes the key: value pair from the directory.
value = directory.pop("key1")

# delete the key and return the Muid of this change
del_muid = directory.delete("key2")
```
Setting multiple keys and values at the same time:
```py
directory.update({"newkey": "newvalue", "another key": "another value"})
```

#### Sequence
The Sequence is equivalent to a Python list. Again, these operations should look pretty familiar! In a Gink Sequence, the contents are ordered by timestamps.\
\
Create a Sequence and append some values:
```python
sequence = Sequence()

sequence.append("Hello, World!")
sequence.append(42)
sequence.append("a")
sequence.append("b")
```
Search for value and return index if found:
```py
found = sequence.index("Hello, World!")
# Returns 0
```

Pop values:
```py
popped = sequence.pop(1)
# Returns 42

# Pops and returns the value at index 0, which is "Hello, World!"
# The destination argument allows you to place the item
# back into the sequence at a different timestamp
# in this case, -1 would indicate the timestamp of the last change.
# So, this sequence is now ordered as ["a", "b", "Hello, World!"]
popped = sequence.pop(0, dest=-1)

```
Insert to specific index:
```py
# Inserts "x" at index 1, between "a" and "b", in this example.
# Comment is an optional parameter that will be included in
# bundle for this change (most operations may contain comments).
sequence.insert(1, "x", comment="insert x")
```

Return the sequence as a Python list:
```py
as_list = list(sequence)
```
#### All Containers
The Container is the parent class for all Gink data structures. Here are some examples of the powerful operations you can do with any container:
##### From Contents
To make it easier to insert data into an object upon initialization, Gink allows you to specify a `contents` argument to the constructor of the object. Different data structures may take different types as contents, but the idea remains the same for all Gink objects.
```python
directory = Directory(database=database, contents={
    "key1": "value1", "key2": 42, "key3": [1, 2, 3, 4]})

key_set = KeySet(database=database, contents=["key1", "key2", 3])

# Vertex creation for pair map population
vertex1 = Vertex()
vertex2 = Vertex()

# Pair Map contents only takes a dictionary. Read the docs for the
# accepted data types for other data structures.
pair_map = PairMap(contents={(noun1, noun2): "value"})
```
##### Back in time
You will frequently see `as_of` in the Gink documentation. `as_of` refers to the time to look back to. There are multiple ways of interacting with `as_of`. If you are curious about how certain timestamps are resolved, take a look at `Database.resolve_timestamp()`\
One easy way is to pass a negative integer indicating how many changes back you want to look.
```python
box = Box(contents="first_value")
box.set("second_value")

# Passing -1 into the as_of argument looks back at the previous value
# Returns "first_value"
previous = box.get(as_of=-1)
```
Another common way to use timestamps is to "save" a time between changes as a variable.
```python
box = Box(contents="first_value")
time_after_first = database.get_now()
box.set("second_value")

# Passing saved timestamp into as_of
# Returns "first_value"
previous = box.get(as_of=time_after_first)
```

##### Reset
Resetting a container is a fundamental operation used to revert the container back to a previous time. Above we looked at using timestamps to get previous values, but resetting to specific times may prove more useful. This example uses a directory, but this functionality works the same for all containers.
```python
directory = Directory()

directory["foo"] = "bar"
directory["bar"] = "foo"
time_between = database.get_now()
directory[7] = {"user": 1003203, "email": "test@test.com"}

has_7 = 7 in directory # returns True
directory.reset(to_time=time_between)
has_7 = 7 in directory # now returns False
has_bar = "bar" in directory # still returns True
```

#### Clearing
Clearing a container does exactly what you would expect it to do. The `Container.clear()` method removes all entries from the container and returns the Muid of the clearance. The clearance is processed as a new database change, which means you can still look back at previous timestamps or reset the database back to before the clearance occurred.
```python
directory = Directory()

directory["foo"] = "bar"
directory["bar"] = "foo"
directory[7] = {"user": 1003203, "email": "test@test.com"}
# Storing the muid of the clearance to use later
clearance_muid = directory.clear()

# Directory is now empty
has_foo = "foo" in directory # Returns False
has_bar = "bar" in directory # Returns False
has_7 = "7" in directory # Returns False

# Using the muid's timestamp to look back before the clearance
# Returns "bar"
previous = directory.get("foo", as_of=clearance_muid.timestamp)

```

### Database Operations

#### Bundling and comments
Think of a bundle as a commit in Git. A bundle is just a collection of changes with an optional comment/message. Without specifying a bundler object, most Gink operations will immediately commit the change in its own bundle, so you don't have to worry about always creating a new bundler, etc. However, if you do want to specify which changes go into a specific bundle, here is an example:
```python
directory = Directory()
bundler = Bundler(comment="example setting values in directory")

directory.set("key1", 1, bundler=bundler)
directory.set("key2", "value2", bundler=bundler)
directory.update({"key3": 3, "key4": 4}, bundler=bundler)

# This seals the bundler and commits changes to database
# at this point, no more changes may be added
database.bundle(bundler)
```

#### Reset
Similar to how `Container.reset()` works, the Database class has its own reset functionality that will reset all containers to the specified time. A "reset" is simply one large bundle of changes that updates the database entries to what they were are the previous timestamp; this allows you to easily look back before the reset.

```python
database = Database(store=store)
root = Directory.get_global_instance(database=database)
queue = Sequence.get_global_instance(database=database)
misc = Directory()

misc["yes"] = False
root["foo"] = "bar"
queue.append("value1")

# No as_of argument defaults to EPOCH
# which is the time of database creation (empty)
database.reset()

# All containers will have a length of 0
# since the database is now empty.
size = len(root)

# to_time=-1 reverts the database to the
# previous change
database.reset(to_time=-1)

# This will now have a len of 1,
# and one element of "value1"
size = len(queue)
```
