# Overview
Gink is a versioned, eventually consistent, multi-paradigm database management system.
It takes a "protocol-first" approach, which facilitates multiple implementations
that can share data.  This repository contains the protocol buffer definitions for the
syncronization protocol, as well as two reference implementations: one in TypeScript and
the other in Python.

# TypeScript
```sh
npm install @x5e/gink
```
Or install from a CDN:
```html
<!-- Get the latest version -->
<script src="https://cdn.jsdelivr.net/npm/@x5e/gink/content_root/generated/packed.min.js"></script>

<!-- Get a specific version -->
<script src="https://cdn.jsdelivr.net/npm/@x5e/gink@0.20240129.1706490080
/content_root/generated/packed.min.js"></script>

<script>
    // Make sure to access the modules using gink.module if you go through the CDN.
    const store = new gink.IndexedDbStore('example');
</script>
```
[TypeScript Docs](https://www.x5e.com/gink/)\
[NPM Package](https://www.npmjs.com/package/@x5e/gink)\
\
The TypeScript implementation can be used in one of three modes:
* via node.js as a server instance that listens to websocket connections from other instances
* via node.js as an instance that doesn't listen for any incoming connections (but can still make outgoing connections to other instances)
* in a web browser, which can't listen for incoming connections but can still connect to server instances

# Python
```sh
pip install gink
```
[Python Docs](https://gink.readthedocs.io/en/latest/)\
[PyPI Package](https://pypi.org/project/gink/)\
\
I created the python implementation of Gink to be a testbed for new ideas and
to provide the simplest expression of all the concepts in Gink.  Well written python
code can essentially serve as executable psudocode.  Code written for this implementation
has been biased in favor of readability and extensibility, rather than raw performance.
For example, (most of) the code doesn't use async functions or multi-threading.
