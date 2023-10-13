# Overview

Gink is a versioned, eventually consistent, multi-paradigm database management system.
It takes a "protocol-first" approach, which facilitates multiple implementations
that can share data.  This repository contains the protocol buffer definitions for the
syncronization protocol, as well as two reference implementations: one in Typescript and
the other in Python.

# Installation
TODO: Installation instructions

# Examples

## Box
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

## Directory
The Directory aims to mimic the functionality of a TypeScript object. If you know how to use an Object, you should already know how to use the directory!
```ts
import { GinkInstance, IndexedDbStore, Directory } from "../implementation";
const store = new IndexedDbStore('directory-example');
const instance = new GinkInstance(store);

const directory = await instance.createDirectory();


```
