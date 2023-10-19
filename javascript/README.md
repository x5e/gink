# Gink in General

Gink is a versioned, eventually consistent, multi-paradigm database management system.
It takes a "protocol-first" approach, which facilitates multiple implementations
that can share data. Additionally, some of the data structures available in Gink are designed to operate similarly to native JavaScript data structures, which removes the steep learning curve found in other backend solutions. For example, Gink has directory, sequence, and key set data structures, which behave similarly to Objects, Arrays, and Sets, respectively.

## Take a look at the full docs [here](www.x5e.com/gink).

The typescript implementation can be used in one of three modes:
* via node.js as a server instance that listens to websocket connections from other instances
* via node.js as an instance that doesn't listen for any incoming connections (but can still make outgoing connections to other instances)
* in a web browser, which can't listen for incoming connections but can still connect to server instances

* [Installation](#installation)
* [Examples](#examples)
    * [Data Structures](#data-structures)
    * [Instance Operations](#instance)

## Installation
```sh
npm install @x5e/gink
```

## Examples
To see examples for all data structures in the TypeScript implementation, check out our full [docs](https://www.x5e.com/gink/).

Import and initialize database and ginkInstance:
```ts
import { GinkInstance, IndexedDbStore, Directory } from "@x5e/gink";

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
