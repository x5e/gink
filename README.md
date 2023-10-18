# Overview

Gink is a versioned, eventually consistent, multi-paradigm database management system.
It takes a "protocol-first" approach, which facilitates multiple implementations
that can share data.  This repository contains the protocol buffer definitions for the
syncronization protocol, as well as two reference implementations: one in Typescript and
the other in Python.

* [TypeScript](#typescript)
    * [Installation](#installation)
    * [Examples](#examples)
        * [Data Structures](#data-structures)
        * [Instance Operations](#instance)
* [Python](#python)
    * [Installation](#installation-1)
    * [Examples](#examples-1)
        * [Data Structures](#data-structures-1)
        * [Database Operations](#database-operations)

# TypeScript

[TypeScript Docs](https://www.x5e.com/gink/)

The typescript implementation can be used in one of three modes:
* via node.js as a server instance that listens to websocket connections from other instances
* via node.js as an instance that doesn't listen for any incoming connections (but can still make outgoing connections to other instances)
* in a web browser, which can't listen for incoming connections but can still connect to server instances

## Installation
### Using npm
```sh
npm install @x5e/gink
```
Note: The current gink package on npm is outdated and will be updated soon.

## Examples
To see examples for all data structures in the TypeScript implementation, check out our full [docs](https://www.x5e.com/gink/).

Import and initialize database and ginkInstance:
```ts
import { GinkInstance, IndexedDbStore, Directory } from "gink";

const store = new IndexedDbStore('examples');
const instance = new GinkInstance(store);
```
All following examples will assume you have a store and instance.

### Data Structures
#### Box
A `Box` is a very simple data structure that can hold only one value at a time; you can set or get its value.\
\
Create the box:
```ts
const aBox: Box = await instance.createBox();
```

Set and get its value, and check the size
```ts
await aBox.set("example value");

// Get the value - this will return "example value"
const result = await aBox.get();

// Will always have a size of 0 or 1 (in this case, 1)
const size = await aBox.size();
```

#### Directory
The `Directory` aims to mimic the functionality of a TypeScript object. If you know how to use an Object, you should already know how to use the directory!\
\
Create the directory:
```ts
const directory = await instance.createDirectory();
```

Setting {Key: Value} pairs and getting them:
```ts
await directory.set("key1", "value1");
await directory.set("foo", "bar");
const result = await directory.get("key1");
```

Get the directory as a JavaScript Map:
```ts
const asMap = await directory.toMap();
```

Storing sub-Directories:
```ts
const subdir = await instance.createDirectory();
await directory.set("new dir", subdir);
```

#### Sequence
A `Sequence` is the Gink version of a JavaScript Array. Sequences are specifically ordered by time of insertion, so they end up representing a queue quite well. Due to the fact they are ordered by insertion, Sequences do not support `unshift` like a JS Array.\
\
Create a new Sequence:
```ts
const seq: Sequence = await instance.createSequence();
```

Pushing and popping
```ts
await seq.push("A");
await seq.push("B");
await seq.push("C");

// Deletes and returns "C"
const popped = await seq.pop();

// Deletes and returns "A"
const index_popped = await seq.pop(0);
```

Get the Gink Sequence as a JavaScript Array:
```ts
const as_array = await seq.toArray();
```

Getting and moving values:
```ts
await seq.push("B");
// Saving the muid of this transaction to use later
const cMuid = await seq.push("C");
await seq.push("D");

// Get the value at the end of the sequence
const atEnd = await seq.at(-1); // returns "D"

// first value, returns "B"
const beginning = await seq.at(0);

// Reordering
// Moves position 0 ("B") to the last position
await seq.move(0, -1);
// now looks like ["C", "D", "B"]

// Moving elements by their Muid
await seq.move(cMuid, 1);
// now looks like ["D", "C", "B"]
```
Get all entries in the sequence:
```ts
// returns an async iterator across everything in the list
// returns pairs of (Muid, Value)
const entries = await seq.entries();
```

#### All Containers
Most of these examples use a `Directory` for simplicity, but these operations can be performed on any container and have many applications.

##### Back in time
A parameter you may come across in many different functions of Gink is `asOf`. asOf can be used to look back to a specific time, or just look back to a specfic number of changes ago.\
\
One easy way to interact with `asOf` is to save timestamps after certain operations.
```ts
const directory = instance.createDirectory();

// saving a timestamp before anything is added
const time0 = instance.getNow();
await directory.set("foo", "bar");
// saving timestamp after key "foo" has been added.
const time1 = instance.getNow();
await directory.set("A", "B");
```

Looking at the directory using the timestamps:
```ts
// at time0, the directory was empty.
// this will return Map{}
const emptyMap = directory.toMap(time0);

// at time1, the directory did not have the key "A"
// this will return false
let hasA = directory.has("A", time1);
```

Another way to look back in time is by using a "relative" timestamp. In this case, relative just means looking back a certain number of commits ago. Think of the current state of the database as 0, so the previous commit would be -1, etc.
```ts
// Since adding "A": "B" was the last commit,
// this looks back before it, so it will return false.
let hasA = directory.has("A", -1);

// to visualize, the map at asOf=-1 would look like
// Map{"foo"=>"bar"} (using the directory above)
const fooMap = directory.toMap(-1);
```

##### Clear
All containers may be completely cleared out by using `Container.clear()`. By default, clearing out a container does not mean the data is gone, just that the container will now be empty. If the purge parameter is set to true, the data will be completely purged from the instance.
```ts
const directory = await instance.createDirectory();

await directory.set('A', 'B');

// save the muid from the clearance
// pass true to clear() to purge, defaults to false
const clearMuid = await directory.clear(false);

// will return false after clearance
const hasA = await directory.has("A");

// using the timestamp of the muid to look back before the clearance.
// returns true
const hasABeforeClear = await directory.has("A", clearMuid.timestamp)
```

### Instance
#### Connecting to other instances
TODO

# Python
## Installation
Assuming you have Python and Pip installed:
```sh
pip3 install gink
```
Note: the current version of gink on PyPI is outdated and will be updated soon.

## Examples
This page does not include examples for all data structures. Take a look at our [documentation](https://gink.readthedocs.io/en/latest/) for all examples and full docs.

### Data Structures

There are some operations that are available to all Containers, which are shown at the [end of this page](#all-containers-1).\
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
result = box.get() # Returns the python dictionary just added

if not box.isEmpty():
    print(box.size()) # This will only return 0 or 1 (1 in this case).
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
database.commit(bundler)
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
