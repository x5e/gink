# Overview

Gink is a versioned, eventually consistent, multi-paradigm database management system.
It takes a "protocol-first" approach, which facilitates multiple implementations
that can share data. Additionally, some of the data structures available in Gink are designed to operate similarly to native JavaScript data structures, which removes the steep learning curve found in other backend solutions. For example, Gink has directory, sequence, and key set data structures, which behave similarly to Objects, Arrays, and Sets, respectively.

# Installation
TODO: Installation instructions

## Quickstart

Example - create a directory\
Take a look at other examples below for a more in depth look at all of the available data structures.

```ts
import { GinkInstance, IndexedDbStore, Directory } from "../implementation";

// Initialize document store and database
const store = new IndexedDbStore('directory-example');
const instance = new GinkInstance(store);

// Create a directory object (more info about this and other
// data structures can be found on their respective pages)
const directory = await instance.createDirectory();

await directory.set("key1", "value1")

// Gets the value associated with the provided key,
// so this returns "value1"
const result = await directory.get("key1");
```

# Examples
All examples will need a store and `GinkInstance`:
```ts
import { IndexedDbStore, GinkInstance } from "../implementation";

const store = new IndexedDbStore('examples');
const instance = new GinkInstance(store);
```

## Data Structures

### Box
A `Box` is the simplest data structure available on Gink. It can hold only one value at a time; you can set its value, or get its value.
```ts
// Create a Box
const aBox: Box = await instance.createBox();

// Set the value in the box
await aBox.set("example value");

// Get the value - this will return "example value"
const result = await aBox.get();

// Will always have a size of 0 or 1 (in this case, 1)
const size = await aBox.size();

// Removes the value in the box
await aBox.clear();

// This will now return undefined
const no_result = await aBox.get();
```

### Directory
The `Directory` aims to mimic the functionality of a TypeScript object. If you know how to use an Object, you should already know how to use the directory!
```ts
const directory = await instance.createDirectory();

// As seen in the quick start, some of the basic
// directory operations:
await directory.set("key1", "value1");
await directory.set("foo", "bar");
const result = await directory.get("key1");

// returns the Gink Directory as a TypeScript Map
const asMap = await directory.toMap();

// Storing sub-Directories
const subdir = await instance.createDirectory();
await directory.set("new dir", subdir);
```

### Sequence
A `Sequence` is the Gink version of a JavaScript Array. Sequences are specifically ordered by time of insertion, so they end up representing a queue quite well. Due to the fact they are ordered by insertion, Sequences do not support `unshift`.

```ts
const seq: Sequence = await instance.createSequence();

await seq.push("A");
await seq.push("B");
await seq.push("C");

// Returns JavaScript Array ["A", "B", "C"]
const as_array = await seq.toArray();

// Deletes and returns "C"
const popped = await seq.pop();

// Deletes and returns "A"
const index_popped = await seq.pop(0);

// Saving the muid of this transaction to use later
const cMuid = await seq.push("C");
await seq.push("D");
// Current sequence is ["B", "C", "D"]

// Get the value at the end of the sequence
// returns "D"
const atEnd = await seq.at(-1);

// first value, returns "B"
const beginning = await seq.at(0);

// returns an async iterator across everything in the list
// returns pairs of (Muid, Value)
// A Muid is basically the ID of that change in the db.
// Just as you saw numbers used as the index to retrieve values,
// the muid of the entry can also be used to retrieve the value.
const entries = await seq.entries();

// Reordering sequences
// Moves position 0 ("B") to the last position
await seq.move(0, -1);
// now looks like ["C", "D", "B"]

// Moving elements by their Muid
await seq.move(cMuid, 1);
// now looks like ["D", "C", "B"]
```

### KeySet
A Gink `KeySet` behaves similarly to a JavaScript Set. A `KeySet` may only contain unique values. These values may not include other Gink Containers (check out `Role` if you are looking for a collection of Containers).

```ts
const ks = await instance.createKeySet();

await ks.add("key1");

// Add an Array to the key set
const myKey = new Uint8Array(3);
myKey[0] = 94;
myKey[2] = 255;
await ks.add(myKey);

// Check if an item is in the key set
// returns true
await ks.has(myKey);

// Check how many items are in the key set
// returns 2
const size = await ks.size();

await ks.delete(myKey);

// add multiple items at once
await ks.update(["key2", 3, "key4"]);

// since there are no values in the key set, ks.entries()
// returns an async generator of [Key, Key]
// in this case: AsyncGenerator(["key1", "key1"], ["key2", "key2"]...)
const entries = ks.entries();

// returns this key set as a JavaScript Set
const asSet = ks.toSet();
```

### PairSet
A `PairSet` is a data structure that resembles a Set, but has very specific items that can be added. The items in a `PairSet` consist of (`Container`, `Container`) pairs. The operations of a PairSet are pretty simple - the pair is either included or excluded.

```ts
const ps = await instance.createPairSet();

// create a few other containers to add as pairs
const box1 = await instance.createBox();
const box2 = await instance.createBox();
const box3 = await instance.createBox();

// Include box1 and box2 in the PairSet
await ps.include([box1, box2]);

// You can mix and match passing Muids and
// container instances when including, excluding, etc.
await ps.include([box2.address, box3]);

// returns true
const is_contained = ps.contains([box1, box2])

// returns a JavaScript Set of {[Muid, Muid],[Muid, Muid]...}
const toSet = await ps.get_pairs();
```

### PairMap
A `PairMap` is quite similar to a `PairSet`, in that its keys may only contain pairs of Containers (or their addresses). A `PairMap` goes a step further and allows a value to be associated to the pair of containers. Think of a `PairMap` as a JavaScript `Map` with keys of [Container, Container] that map to some value. Many of the methods here are the same as those of the JS Map.

```ts
const pm = await instance.createPairMap();

const box1 = await instance.createBox();
const box2 = await instance.createBox();
const box3 = await instance.createBox();

// now looks like {[Box, Box]: "box1 -> box2"}
await pm.set([box1, box2], "box1 -> box2");

await pm.set([box2.address, box3.address], "using muids");

// returns "box1 -> box2"
const first_val = await pm.get([box1, box2]);

// returns true
const has_first = await pm.has([box1.address, box2.address]);

// returns undefined
const doesnt_exist = await pm.get([box1, box3]);

// returns 2
const size = await pm.size();

// returns a JavaScript Map of
// {[Muid, Muid]: Value, ...}
const items = await pm.items();
```

### Role
A `Role` acts as a collection of containers that all have something in common. Similar to the `PairSet`, the most common operations are pretty simple - include or exclude.

```ts
const role = await instance.createRole();

// create some containers to include
const box1 = await instance.createBox();
const box2 = await instance.createBox();
const directory1 = await instance.createDirectory();

// include by Container instance
await role.include(box1);
// include by Muid
await role.include(directory1.address);

await role.exclude(directory1);

// containers can be excluded from the role
// even if it had not been included.
await role.exclude(box2);

// returns true
const is_contained = await role.contains(box1);

// returns a JavaScript Array of Gink Containers
const asArray = await role.toArray();

// returns an async generator of all containers in the role.
const members = await role.get_members();

// iterating through the role members
for (const member of members) {
    const address = member.address;
    const instance = member.ginkInstance;

    const asJson = member.toJson();
}
```

### Property
The Gink `Property` is a container specifically used to map a `Container` to a value. As the name suggests, this can be used for storing properties of a container. For this, the value would likely be a JavaScript `Object`.
```ts
const property = await instance.createProperty();

const directory = await instance.createDirectory();

await property.set(directory, {"property": "example", "last_changed": "now"});

// gets the property for this directory
// in this case, {"property": "example", "last_changed": "now"}
const dir_property = await property.get(directory);

// check if a property exists for a Container
// returns true
const exists = await property.has(directory);

// deletes property associated with container
await property.delete(directory);
```

### All Containers

#### Back in time
A parameter you may come across in many different functions of Gink is `asOf`. asOf can be used to look back to a specific time, or just look back to a specfic number of changes ago.
```ts
// using a directory for this example,
// but all containers can make use of timestamps.
const directory = instance.createDirectory();


```
#### Reset
#### Clear
#### toJson

## Database Operations
### Reset
### Connecting to other instances
