# Overview

Gink is a versioned, eventually consistent, multi-paradigm database management system.
It takes a "protocol-first" approach, which facilitates multiple implementations
that can share data. Additionally, some of the data structures available in Gink are designed to operate similarly to native JavaScript data structures, which removes the steep learning curve found in other backend solutions. For example, Gink has Directory, Sequence, and KeySet data structures, which behave similarly to Objects, Arrays, and Sets, respectively.

# Jump Around
- [Overview](#overview)
- [Installation](#installation)
- [Quickstart](#quickstart)
- [CLI](#cli)
    - [Arguments](#arguments)
- [Examples](#examples)
    - [Data Structures](#data-structures)
        - [Box](#box)
        - [Directory](#directory)
        - [Sequence](#sequence)
        - [KeySet](#keyset)
        - [PairSet](#pairset)
        - [PairMap](#pairmap)
        - [Group](#group)
        - [Property](#property)
        - [All Containers](#all-containers)
            - [As-Of Queries](#as-of-queries)
            - [Clear](#clear)
            - [toJson](#tojson)
    - [Database Operations](#database-operations)
        - [Bundling and Bundles](#bundling-and-bundles)
        - [Connecting to databases](#connecting-to-other-databases)
        - [Token Authentication](#token-authentication)


# Installation
Assuming you have node.js and npm installed already:
```sh
npm install @x5e/gink
```
Now you can import or require Gink like this:
```js
const { MemoryStore, Database } = require("@x5e/gink");
```
If you'd prefer to import from a CDN:
```html
<!-- Get the latest version -->
<script src="https://cdn.jsdelivr.net/npm/@x5e/gink/content_root/generated/packed.min.js"></script>

<!-- Get a specific version -->
<script src="https://cdn.jsdelivr.net/npm/@x5e/gink@0.20240129.1706490080
/content_root/generated/packed.min.js"></script>

<script>
    // Make sure to access the modules using gink.module if you go through the CDN.
    const store = new gink.MemoryStore();
</script>
```

# Quickstart

Example - create a `Directory`\
Take a look at other examples below for a more in depth look at all of the available data structures.

```js
const { MemoryStore, Database } = require("@x5e/gink");

// Initialize document store and database
const store = new MemoryStore();
const database = new Database(store);

// Create a directory object (more info about this and other
// data structures can be found on their respective pages)
const directory = await database.createDirectory();

await directory.set("key1", "value1")

// Gets the value associated with the provided key,
// so this returns "value1"
const result = await directory.get("key1");
```

# CLI
```
npx gink [targets] // ex: wss://localhost:8080
```
## Arguments

### -c, --connect-to [targets]*
gink databases to connect to (e.g: wss://localhost:8080 wss://localhost:8081)

### -l, --listen-on [port | None]
Port to listen on. If flag is not included, gink does not listen for incoming connections. \
Defaults to 8080. This may also be set using env GINK_PORT.

### --data-file [path]
The path to a `LogBackedStore` data file. Setting this will cause the CLI to load the database from the provided file into a `LogBackedStore`. \
Defaults to env GINK_DATA_FILE.

### -i, --identity [name]
Explicitly set your identity. \
Defaults to `user@hostname`.

### --static-path [path]
The path to serve static files from. If you change this, you won't be able to access the Gink dashboard. \
Defaults to env GINK_STATIC_PATH.

### --auth-token [token]
If gink is listening for connections, this is the token required for clients to connect. If gink is connecting to other databases, this token will be passed. \
Defaults to env GINK_AUTH_TOKEN.

### --ssl-cert [path]
The path to a certificate file. If this and --ssl-key are set and valid, the server will listen for secure connections using SSL. \
Defaults to env GINK_SSL_CERT.

### --ssl-key [path]
The path to a key file. If this and --ssl-cert are set and valid, the server will listen for secure connections using SSL.
Defaults to env GINK_SSL_KEY.

# Examples
All examples will need a `Store` and `Database`:
```js
const { MemoryStore, Database } = require("@x5e/gink");

const store = new MemoryStore();
const database = new Database(store);
```

## Data Structures

### Box
A `Box` is the simplest data structure available on Gink. It can hold only one value at a time; you can set its value, or get its value.
```ts
// Create a Box
const box = await Box.create(database);

// Set the value in the box
await box.set("example value");

// Get the value - this will return "example value"
const result = await box.get();

// Will always have a size of 0 or 1 (in this case, 1)
const size = await box.size();

// Removes the value in the box
await box.clear();

// This will now return undefined
const noResult = await box.get();
```

### Directory
The `Directory` aims to mimic the functionality and API of a JavaScript Map.
```js
const directory = await Directory.create(database);

// As seen in the quick start, some of the basic
// directory operations:
await directory.set("key1", "value1");
await directory.set("foo", "bar");
const result = await directory.get("key1");

// returns the Gink Directory as a TypeScript Map
const asMap = await directory.toMap();

// Storing sub-Directories
const subdir = await Directory.create(database);
await directory.set("new dir", subdir);
```

### Sequence
A `Sequence` is the Gink version of a JavaScript Array. Sequences are specifically ordered by time of insertion, so they end up representing a queue quite well. Due to the fact they are ordered by insertion, Sequences do not support `unshift`.

```ts
const seq = await Sequence.create(database);

await seq.push("A");
await seq.push("B");
await seq.push("C");

// Returns JavaScript Array ["A", "B", "C"]
const asArray = await seq.toArray();

// Deletes and returns "C"
const popped = await seq.pop();

// Deletes and returns "A"
const indexPopped = await seq.pop(0);

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
// Iterate through entries like this:
for await (const entry of entries) {
    console.log(entry);
}

// Reordering sequences
// Moves position 0 ("B") to the last position
await seq.move(0, -1);
// now looks like ["C", "D", "B"]

// Moving elements by their Muid
await seq.move(cMuid, 1);
// now looks like ["D", "C", "B"]
```

### KeySet
A Gink `KeySet` behaves similarly to a JavaScript Set. A `KeySet` may only contain unique values. These values may not include other Gink Containers (check out `Group` if you are looking for a collection of Containers).

```ts
const ks = await KeySet.create(database);

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
const entries = await ks.entries();

// returns this key set as a JavaScript Set
const asSet = await ks.toSet();
```

### PairSet
A `PairSet` is a data structure that resembles a Set, but has very specific items that can be added. The items in a `PairSet` consist of (`Container`, `Container`) pairs. The operations of a PairSet are pretty simple - the pair is either included or excluded.

```ts
const ps = await database.createPairSet();

// create a few other containers to add as pairs
const box1 = await Box.create(database);
const box2 = await Box.create(database);
const box3 = await Box.create(database);

// Include box1 and box2 in the PairSet
await ps.include([box1, box2]);

// You can mix and match passing Muids and
// containers when including, excluding, etc.
await ps.include([box2.address, box3]);

// returns true
const isContained = await ps.contains([box1, box2])

// returns a JavaScript Set of {[Muid, Muid],[Muid, Muid]...}
const toSet = await ps.getPairs();
```

### PairMap
A `PairMap` is similar to a `PairSet`, in that its keys may only contain pairs of Containers (or their addresses). A `PairMap` goes a step further and allows a value to be associated to the pair of containers. Think of a `PairMap` as a JavaScript `Map` with keys of [Container, Container] that map to some value. Many of the methods here are the same as those of the JS Map.

```ts
const pm = await database.createPairMap();

const box1 = await Box.create(database);
const box2 = await Box.create(database);
const box3 = await Box.create(database);

// now looks like {[Box, Box]: "box1 -> box2"}
await pm.set([box1, box2], "box1 -> box2");

await pm.set([box2.address, box3.address], "using muids");

// returns "box1 -> box2"
const firstVal = await pm.get([box1, box2]);

// returns true
const hasFirst = await pm.has([box1.address, box2.address]);

// returns undefined
const doesntExist = await pm.get([box1, box3]);

// returns 2
const size = await pm.size();

// returns a JavaScript Map of
// {[Muid, Muid]: Value, ...}
const items = await pm.items();
```

### Group
A `Group` acts as a collection of containers that all have something in common. Similar to the `PairSet`, the most common operations are pretty simple - include or exclude.

```ts
const group = await database.createGroup();

// create some containers to include
const box1 = await Box.create(database);
const box2 = await Box.create(database);
const directory1 = await database.createDirectory();

// include by Container instance
await group.include(box1);
// include by Muid
await group.include(directory1.address);

await group.exclude(directory1);

// containers can be excluded from the group
// even if it had not been included.
await group.exclude(box2);

// returns true
const isIncluded = await group.isIncluded(box1);

// returns a JavaScript Array of Gink Containers
const asArray = await group.includedAsArray();

// returns an async generator of all containers in the group.
const members = group.getMembers();

// iterating through the group members
for await (const member of members) {
    const address = member.address;
    const database = member.database;

    const asJson = member.toJson();
}
```

### Property
The Gink `Property` is a container specifically used to map a `Container` to a value. As the name suggests, this can be used for storing properties of a container. For this, the value would likely be a JavaScript `Object`.
```ts
const property = await database.createProperty();

const directory = await database.createDirectory();

await property.set(directory, new Map([["property", "example"], ["last_changed", "now"]]));

// gets the property for this directory
// in this case, {"property": "example", "last_changed": "now"}
const dirProperty = await property.get(directory);

// check if a property exists for a Container
// returns true
const exists = await property.has(directory);

// deletes property associated with container
await property.delete(directory);
```

### All Containers
Most of these examples use a `Directory` for simplicity, but the following operations can be performed on any container and have many applications.

#### As-Of Queries
A parameter you may come across in many different functions of Gink is `asOf`. asOf can be used to look back to a specific time, or just look back to a specfic number of changes ago.
```ts
// using a directory for this example,
// but all containers can make use of timestamps.
const directory = await database.createDirectory();

// saving a timestamp before anything is added
const time0 = generateTimestamp();
await directory.set("foo", "bar");
const time1 = generateTimestamp();
await directory.set("A", "B");
// current directory looks like
// {"foo": "bar", "A": "B"}

// at time0, the directory was empty.
// this will return Map{}
const emptyMap = await directory.toMap(time0);

// at time1, the directory did not have the key "A"
// this will return false
let hasAMuid = await directory.has("A", time1);

// instead of saving timestamps, you can
// use negative numbers to indicate how
// many changes back you'd like to look.
// Since adding "A": "B" was the last change,
// this looks back before it, so it will return false.
let hasALast = await directory.has("A", -1);

// to visualize, the map at asOf=-1 would look like
// Map{"foo"=>"bar"}
const asMap = await directory.toMap(-1);
```

#### Clear
All containers may be completely cleared out by using `Container.clear()`. By default, clearing out a container does not mean the data is gone, just that the container will now be empty. If the purge parameter is set to true, the data will be completely purged from the database.
```ts
const directory = await database.createDirectory();

await directory.set('A', 'B');

// save the muid from the clearance
// pass true to clear() to purge.
// defaults to false
const clearMuid = await directory.clear(false);

// will return false after clearance
const hasA = await directory.has("A");

// using the timestamp of the muid to look back before the clearance.
// returns true
const hasABeforeClear = await directory.has("A", clearMuid.timestamp);
```

#### toJson
All containers and their contents can be represented as JSON
```ts
const directory = await database.createDirectory();

await directory.set("A", "B");

// nesting Gink Directories
const other = await database.createDirectory();
await other.set("xxx", "yyy");

await directory.set("C", other);

// viewing contents as JSON
const asJSON = await directory.toJson();
// returns {"A": "B", "C": {"xxx": "yyy"}}
```

## Database Operations
### Bundling and bundles
Without specifying a bundler when performing an action, Gink defaults to immediately committing each change
as they happen. If you would like to control which changes are bundled together and control when the bundle
is comitted to the database, here is an example:
```ts
const{ Bundler } = require("@x5e/gink");

const directory = await database.createDirectory();

const bundler = await database.startBundle();

// pass the bundler into each operation
await directory.set("key1", "value1", bundler);
await directory.set("key2", 2, bundler);
// at this point, these changes have not been committed.

// bundle this bundle to the database
await bundler.commit("comment");
```

### Connecting to other databases
Start a Gink server that listens for websocket connections: \
Optionally export a path to a certificate and keyfile to start a secure server.
```sh
export GINK_SSL_CERT=/path/to/cert
export GINK_SSL_KEY=/path/to/key
```
```sh
export GINK_PORT=8080 # or a different port you want to listen on
npx gink
```
Once you have a server running, create a new database and connect it to the server:
```ts
const store = new MemoryStore();
const database = new Database(store);

await database.connectTo("ws://localhost:8080"); // or wherever your server is hosted
```
The server and client should now sync bundles. <br>
<br>
Clients can also connect to multiple Gink servers, which can ensure a very high degree of
availability if they are hosted using different providers.<br>

```ts
await database.connectTo("ws://host1:port");
await database.connectTo("wss://host2:port"); // wss for secure servers
```

### Token Authentication
Start the Gink server with the environment variable GINK_TOKEN set to the token that will be required for a connection to be accepted.
For example, `export GINK_TOKEN=1451jknr1jnak14jn`. <br>
Now, when your server gets a connection attempt (presumably from another Gink database), they will need to have the token. <br>
<br>
For the client, there are two ways to supply a token:<br>
If starting an database from the CLI - you will need to have the token as an env variable `GINK_AUTH_TOKEN`. This will automatically include the token in all connection requests to the targets supplied in the command (`npx gink ws://localhost:8080`).
<br>
If you are connecting from a client through the Gink API, pass the auth token to `Database.connectTo()` like so:
```js
const database = new gink.Database()
await database.connectTo("ws://localhost:8080", {authToken: "1451jknr1jnak14jn"});
```
