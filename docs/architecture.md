# Architecture

This document gives a high-level map of Gink for developers who are new to the project. It deliberately focuses on concepts and file locations rather than every method.

## System Shape

Gink has three layers:

1. A protocol layer defined by protobuf files in `proto/`.
2. Storage engines that save raw bundles and materialize indexes for queries.
3. User-facing database/container APIs in Python and TypeScript.

The protocol is the center of the design. The Python and TypeScript implementations should be thought of as reference implementations of the same data model rather than two unrelated libraries.

## Data Flow

A typical write follows this path:

1. User code mutates a container, such as `Directory.set()` or `Sequence.append()`.
2. The container builds a protobuf `Change`.
3. A `Bundler` groups one or more changes.
4. `Database` seals the bundle with timestamp, chain metadata, previous-link hash, and signature.
5. The store saves the raw bundle bytes and updates query indexes.
6. The relay/sync layer offers the bundle to connected peers.

A typical read follows this path:

1. User code asks a container for current or historical state.
2. The container resolves the requested `as_of` timestamp.
3. The store scans the relevant materialized indexes.
4. The container decodes values or references and returns host-language objects.

## Protocol Layer

The most important protocol files are:

- `proto/bundle.proto`: transaction-like unit of replication.
- `proto/change.proto`: wrapper around container, entry, movement, and clearance changes.
- `proto/container.proto`: container definitions and behavior codes.
- `proto/entry.proto`: values or references placed in containers.
- `proto/movement.proto`: reordering or deletion of ordered entries.
- `proto/clearance.proto`: clear operations.
- `proto/sync_message.proto`: WebSocket peer sync messages.
- `proto/muid.proto`: change identifiers.
- `proto/value.proto`: encoded user values.

Implementations should preserve raw bundle bytes. This allows a peer that does not understand a newer protobuf field to save and forward it without dropping data.

## Identity And Ordering

Each bundle is identified by a timestamp and medallion. A medallion identifies a database instance or writer. A change inside a bundle gets an offset. Together, these form a MUID:

```text
(timestamp, medallion, offset)
```

MUIDs are used to identify containers, entries, movements, and other addressable changes. See `docs/muid.md` for the bit layout and string format.

## Containers

Containers are the user-facing data structures. They all share history, `as_of` reads, reset behavior, and bundle integration, but each behavior interprets entries differently.

Common containers:

- `Directory`: mapping from string/integer/bytes keys to values or container references.
- `Box`: one current value or reference.
- `Sequence`: ordered values or references.
- `KeySet`: set of scalar keys.
- `PairSet`: set of pairs of entities.
- `PairMap`: mapping from pairs of entities to values or references.
- `Property`: maps described entities to property values.
- `Group`: set of described entities.
- `Accumulator`: delta-based numeric total.
- `Vertex`, `EdgeType`, `Edge`: graph-oriented structures.

The Python implementations live in `python/gink/impl/`. The TypeScript implementations live in `javascript/implementation/`.

## Stores

Stores have two responsibilities:

1. Keep the raw bundle stream.
2. Maintain indexes so containers can answer queries efficiently.

Python stores:

- `LmdbStore`: persistent LMDB-backed store.
- `LogBackedStore`: append-only file-backed store.
- `MemoryStore`: transient store for tests and in-memory use.

TypeScript stores:

- `IndexedDbStore`: browser persistence, also used with a shim in some Node contexts.
- `LogBackedStore`: Node append-only file-backed store over an internal memory store.
- `MemoryStore`: transient store for tests and in-memory use.

Storage code is one of the highest-risk areas. Changes to storage often affect history, reset, clear, movement, purge, sync, and cross-language compatibility.

## Sync Layer

The sync layer uses WebSockets and the protobuf `SyncMessage` type.

At connection time, peers exchange greetings that summarize the chains they have. Each peer then sends bundles the other peer is missing. Bundles are sent as opaque bytes and acknowledged after processing.

Python sync entry points:

- `python/gink/impl/relay.py`
- `python/gink/impl/connection.py`
- `python/gink/impl/listener.py`
- `python/gink/impl/server.py`

TypeScript sync entry points:

- `javascript/implementation/Database.ts`
- `javascript/implementation/ClientConnection.ts`
- `javascript/implementation/ServerConnection.ts`
- `javascript/implementation/SimpleServer.ts`
- `javascript/implementation/Listener.ts`

See `docs/syncing.md` for more detail.

## Public APIs

Python exports its main public surface from `python/gink/__init__.py`. The command-line entry point is `python/gink/__main__.py`.

TypeScript exports its main public surface from `javascript/implementation/index.ts`. The command-line entry point is `javascript/implementation/main.ts`.

When adding documentation examples, prefer explicit store/database construction. In Python, pass `database=database` when creating containers. In TypeScript, construct databases with `new Database({ store })`.

## Generated Files

Generated protobuf and build output should not be edited directly. Use the `Makefile` targets instead:

```sh
make python/gink/builders
make javascript
```

Common generated/build paths include:

- `python/gink/builders`
- `javascript/proto`
- `javascript/tsc.out`
- `javascript/content_root/generated`

## Good First Files

For a quick understanding of the code:

- `README.md`
- `OVERVIEW.md`
- `docs/data_model.md`
- `docs/consistency.md`
- `docs/syncing.md`
- `python/gink/impl/database.py`
- `python/gink/impl/directory.py`
- `javascript/implementation/Database.ts`
- `javascript/implementation/Directory.ts`
