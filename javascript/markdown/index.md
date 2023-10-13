# Overview

Gink is a versioned, eventually consistent, multi-paradigm database management system.
It takes a "protocol-first" approach, which facilitates multiple implementations
that can share data. Additionally, some of the data structures available in Gink are designed to operate similarly to native TypeScript data structures, which removes the steep learning curve found in other backend solutions. For example, Gink has directory, sequence, and key set data structures, which behave similarly to Objects, Arrays, and Sets, respectively.

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
## Data Structures
### Box
A Box is the simplest data structure available on Gink. It can hold only one value at a time; you can set its value, or get its value.
```ts
import { Box, IndexedDbStore, GinkInstance } from "../implementation/index";
// Store and instance setup
const store = new IndexedDbStore('box-example');
const instance = new GinkInstance(store);

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
The Directory aims to mimic the functionality of a TypeScript object. If you know how to use an Object, you should already know how to use the directory!
```ts
import { GinkInstance, IndexedDbStore, Directory } from "../implementation";
const store = new IndexedDbStore('directory-example');
const instance = new GinkInstance(store);

const directory = await instance.createDirectory();

// As seen in the quick start, some of the basic
// directory operations:
await directory.set("key1", "value1");
await directory.set("foo", "bar");
const result = await directory.get("key1");

// returns the Gink Directory as a TypeScript Map
const asMap = await directory.toMap();

// returns the Gink Directory as json
const asJSON = await directory.toJson();

// Storing sub-Directories
const subdir = await instance.createDirectory();
await directory.set("new dir", subdir);

```
