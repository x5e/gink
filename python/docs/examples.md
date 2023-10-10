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
A Box is the simplest data structure available on Gink. It can hold only one value at a time; you can set its value, or get its value.
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

found = sequence.index("Hello, World!")
# Returns 0

popped = sequence.pop(1)
# Returns 42

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
The Key Set is designed to work similarly to a Python Set - it is just a "list" of unique keys. If you are looking for a data structure to hold a reference to another container (or a Muid), check out [Role](#role-examples) below.\
Note: a Key Set can hold keys of types str, int, and bytes.
```python
ks = KeySet(database=database)

ks.add("key1")
ks.add("key2")

is_contained = ks.contains("key1") # Returns True

ks.remove("key1")

ks.update(["key3", "key4"]) # adds multiple keys

popped = ks.pop("key2") # returns "key2"

# Our Python KeySet also includes operations such as
# issubset, issuperset, etc. I encourage you to check out
# the full docs to see the other methods.
ks.update(["key1", "key2"])
# keyset is now ["key1", "key2", "key3", "key4"]
is_subset = ks.issubset(["key1", "key2", "key3", "key4", "key5"])

# returns True
union = ks.union(["key4", "key5"])
# returns ["key1", "key2", "key3", "key4", "key5"]
```

### Pair Set
The Pair Set is the first data structure out of the previous examples that has few similarities to the build-in Python data structures. In Gink, every container is given a "Muid" (to read more about what a Muid is, [click here](#muid)). In simple terms, a Muid is just a unique identifier to keep track of containers (and changes).\
<br>
While the Pair Set's methods do not mimic those of the Python Set, you can think of a Pair Set as a set of tuples. These tuples contain pairs of (Muid, Muid), or (Noun, Noun) (more on Nouns [here](#noun-examples)). Basically, a Pair Set serves to store the fact that two Nouns are connected.

```python
ps = PairSet()

noun1 = Noun()
noun2 = Noun()

# "Include" refers to the fact that the pair is either
# in the pair set, or it is not.
ps.include(pair=(noun1, noun2))
ps.exclude(pair=(noun1, noun2))

# Same as above, but adding the pair using muids.
ps.include(pair=(noun1._muid, noun2,_muid))

is_contained = ps.contains(pair=(noun1, noun2)) # returns True

pairs = ps.get_pairs() # returns Set{(noun1._muid, noun2._muid)}
```

### Pair Map
Similar to the Pair Set, a Pair Map has keys consisting of a (Noun, Noun) or (Muid, Muid) tuple. These keys are mapped to a value, which may be a Container or other standard value (str, int, list, etc.). The Pair Map has methods similar to those  found in the built in map object.

```python
pm = PairMap(database=database)
noun1 = Noun()
noun2 = Noun()

pm.set(key=(noun1, noun2), value="noun1->noun2")

in_pm = pm.has(key=(noun1._muid, noun2._muid)) # returns True
value = pm.get(key=(noun1, noun2)) # returns "noun1->noun2"

items = pm.items() # returns a generator of ((Muid, Muid), value)
```

(role-examples)=
### Role
A Role is simply a collection of Containers that have something in common.
```python
role = Role(database=database)
noun1 = Noun()
noun2 = Noun()

role.include(noun1)
role.include(noun2._muid)

# returns a generator of the member Muids
member_muids = role.get_member_ids()

# returns a Set of the member Containers
members = role.get_members()

role.exclude(noun1)
```

### Property
A Property is used to tie a particular object to a value, which may be any standard value, or another Container.
```python
prop = Property(database=database)
directory = Directory(database=database)

prop.set(directory, "my favorite directory")
contents = prop.get(directory) # Returns "my favorite directory"

# This overwrites the previous property
prop.set(directory, {"key1": "value1", "key2": "value2"})

prop.delete(directory)
```

### Graph
(noun-examples)=
#### Noun
The Noun is a core part of Gink's graph data structure. If you are familiar with graph databases, the Gink Noun is comparable to a Node. The Noun is designed to connect to other nodes through edges, which is described below.
```python
# Basic creation and deletion
user_noun = Noun(database=database)
order_noun = Noun(database=database)

user_noun.remove()
order_noun.remove()

is_alive = user_noun.is_alive() # returns False since we removed it.

# Most of the Noun functionality comes when using
# an edge - more examples below.
```

#### Edge and Verb
An Edge is what connects a Noun to another Noun. The Verb is the `action` of an Edge, or the relationship between the nouns. For example, one noun may be a user, while the other node is an order. This may be depicted as (User)--Ordered-->(Order). User and Order are Nouns, Ordered is the Verb, and the lines connecting them (and the direction) is the Edge.

```python
user_noun = Noun(database=database)
order_noun = Noun(database=database)

# An easy way to connect nouns is by creating a Verb
ordered_verb = Verb(database=database)
ordered_verb.create_edge(user_noun, order_noun, "Ordered")

# We can get all edges of any Verb (can specify source or target) since
# we only have one edge, we don't need to specify a source or target here.
edges = ordered_verb.get_edges()

# Above returns a generator of edges, so lets get the only edge we have so far
ordered_edge = list(edges)[0]

# Now we can get the source, target, and action of this edge
# The action, in this context, is the actual message of the verb, "Ordered"
source = ordered_edge.get_source()
target = ordered_edge.get_target()
action = ordered_edge.get_action()

# To remove the edge
ordered_edge.remove()
```

(all-containers)=
### All Containers
The Container is the parent class for all Gink data structures. Here are some examples of the powerful operations you can do with any container:
#### Global Instance
For each Container type there's a pre-existing global instance with address `Muid(timestamp=-1, medallion=-1, offset=behavior)`. This container type can be written to by any instance, and may be used to coordinate between database instances or just for testing/demo purposes.
```python
global_directory = Directory.get_global_instance(database=database)

global_box = Box.get_global_instance(database=database)

global_key_set = KeySet.get_global_instance(database=database)
```
#### From Contents
To make it easier to insert data into an object upon initialization, Gink allows you to specify a `contents` argument to the constructor of the object. Different data structures may take different types as contents, but the idea remains the same for all Gink objects.
```python
directory = Directory(database=database, contents={"key1": "value1", "key2": 42, "key3": [1, 2, 3, 4]})


```
#### Reset
#### Back in time
#### Bundling and comments
#### Clearing
#### Dumps

## Database Operations
