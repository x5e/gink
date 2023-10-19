# Overview

Gink is a versioned, eventually consistent, multi-paradigm database management system.
It takes a "protocol-first" approach, which facilitates multiple implementations
that can share data. Additionally, some of the data structures available in Gink are designed to operate similarly to native JavaScript data structures, which removes the steep learning curve found in other backend solutions. For example, Gink has directory, sequence, and key set data structures, which behave similarly to Objects, Arrays, and Sets, respectively.

## Take a look at the full docs [here](www.x5e.com/gink).

The typescript implementation can be used in one of three modes:
* via node.js as a server instance that listens to websocket connections from other instances
* via node.js as an instance that doesn't listen for any incoming connections (but can still make outgoing connections to other instances)
* in a web browser, which can't listen for incoming connections but can still connect to server instances
