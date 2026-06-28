# Gink

Gink is a versioned, eventually consistent database system for local-first and peer-to-peer applications. It is built around a protocol-first design: the repository contains protobuf definitions for the data and sync formats plus reference implementations in Python and TypeScript.

The short version is: Gink is trying to be "git for data structures." You work with familiar containers such as directories/maps, sequences/lists, boxes, sets, properties, and graph-like relationships. Gink records changes as signed bundles, keeps history when configured to do so, supports as-of reads and resets, and can sync bundles between independent instances.

## Project Status

Gink is useful for experimentation, prototypes, and specialized applications that need versioned local data with peer sync. It should still be treated as an early-stage database project rather than a turnkey production database. Some APIs are experimental, some documentation is still being filled in, and production concerns such as authorization, key management, compaction, and operational monitoring need careful application-specific design.

## Why Gink Exists

Gink is intended for systems that need some combination of:

- Local reads and writes without requiring a central server for every operation.
- Multi-master sync between Python, Node, and browser peers.
- Durable history, attribution, comments, reset, and time-travel queries.
- Data structures that feel natural in the host language.
- A wire format that can be implemented by more than one runtime.

If you only need a conventional SQL database, document database, or collaborative text editor, other tools may be a better fit. Gink is most interesting when the history and sync protocol are part of the product.

## How It Works

The durable unit of replication is a signed `Bundle`. A bundle contains one or more protobuf `Change` messages. Changes can create containers, add or delete entries, move ordered entries, or clear a container. Bundles are organized into per-writer chains, and sync peers exchange opaque bundle bytes so older implementations can preserve fields they do not yet understand.

Gink identifiers are called MUIDs. A MUID combines a timestamp, a medallion identifying the originating database instance, and an offset within a bundle. This makes changes globally identifiable and sortable.

For more detail, start with:

- `docs/architecture.md` for the high-level architecture.
- `docs/data_model.md` for the protocol data model.
- `docs/consistency.md` for history, conflict, and convergence behavior.
- `docs/syncing.md` for peer synchronization.
- `docs/security.md` for trust boundaries and safety notes.
- `OVERVIEW.md` for an internal agent/contributor map of the codebase.

## TypeScript

Install from npm:

```sh
npm install @x5e/gink
```

Or install from a CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/@x5e/gink/content_root/generated/packed.min.js"></script>

<script>
    const store = new gink.IndexedDbStore("example");
    const database = new gink.Database({ store });
</script>
```

Basic browser or Node usage:

```ts
import { Database, Directory, IndexedDbStore } from "@x5e/gink";

const store = new IndexedDbStore("example");
const database = new Database({ store });

const root = database.getRoot();
await root.set("message", "hello from Gink");
console.log(await root.get("message"));

const directory = await Directory.create(database);
await directory.set("nested", { ok: true });
await root.set("directory", directory);
```

The TypeScript implementation can run:

- In Node as a server that listens for WebSocket connections.
- In Node as a client/embedded database that connects to other peers.
- In a browser using IndexedDB for local persistence and outbound WebSocket connections for sync.

See `javascript/README.md` and [the TypeScript docs](https://www.x5e.com/gink/).

## Python

Install from PyPI:

```sh
pip install gink
```

Python requires Python 3.12 or newer.

Basic usage:

```python
from gink import Database, Directory, LmdbStore

store = LmdbStore("example.db")
database = Database(store=store)
root = database.get_root()

root["message"] = "hello from Gink"
print(root["message"])

directory = Directory(database=database)
directory["nested"] = {"ok": True}
root["directory"] = directory
```

The Python implementation is intentionally readability-first and synchronous. It is a good place to understand the concepts and is also useful for local tools, server processes, and experiments.

See `python/README.md` and [the Python docs](https://gink.readthedocs.io/en/latest/).

## Sync In One Minute

Start a TypeScript server:

```sh
cd javascript
npm install
npm run build
npx gink --listen-on 8080 --data-file /tmp/gink-server.log
```

Connect a TypeScript database:

```ts
const database = new Database({ store: new IndexedDbStore("client") });
await database.connectTo("ws://localhost:8080");
```

Or connect a Python process:

```sh
python -m gink client.db --connect_to ws://localhost:8080 --loop
```

Connected peers exchange bundle summaries and then send any bundles the other side is missing. See `docs/syncing.md` for the full model and caveats.

## Repository Layout

```text
proto/                      Protocol buffer definitions.
python/gink/                Python implementation and CLI.
python/docs/                Python Sphinx documentation.
javascript/implementation/  TypeScript implementation and CLI.
javascript/content_root/    Browser dashboard and bundled assets.
docs/                       Project-level specs and internal docs.
```

## Development

The Docker build is the most complete validation path:

```sh
docker build .
```

For local development, see `docs/development.md`. The short version is:

```sh
make
make test-python
make test-javascript
```

Generated protobuf/build output should be regenerated through `make`, not edited directly.
