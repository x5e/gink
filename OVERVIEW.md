# Gink Agent Overview

This file is an internal orientation guide for agents and contributors. It is not external product documentation. Use it to get enough context to navigate the codebase without rereading every implementation file.

## One-Screen Summary

Gink is a protocol-first, versioned, eventually consistent database system. The durable replication unit is a signed protobuf `Bundle` containing one or more `Change` records. Bundles form append-only per-author chains, are identified by sortable MUIDs, and can be exchanged between independent implementations.

The repository contains the protocol definitions plus two main implementations:

- Python: readability-first reference implementation, CLI, LMDB/log/memory stores, WebSocket relay, WSGI integration.
- TypeScript: browser and Node implementation, IndexedDB/log/memory stores, WebSocket client/server, browser bundle, dashboard.

Think of the project as "git for data structures": familiar containers such as directories/maps, sequences/lists, boxes, sets, graph-ish structures, properties, and accumulators, with history, time-travel reads, reset, comments, and peer sync.

## Core Mental Model

- `Bundle`: signed transaction-like unit of replication. Defined in `proto/bundle.proto`.
- `Change`: one operation inside a bundle. A change can create a container, add/update/delete an entry, move an ordered entry, or clear a container. Defined in `proto/change.proto` and related proto files.
- `Chain`: append-only stream from one writer identity/medallion. Sync peers track which chains they have seen and how far.
- `Muid`: sortable 128-bit-ish identifier made from timestamp, medallion, and offset. See `docs/muid.md`.
- `Container`: user-facing data structure. Examples: `Directory`, `Sequence`, `Box`, `KeySet`, `PairMap`, `PairSet`, `Property`, `Group`, `Accumulator`, `Vertex`, `EdgeType`.
- `Store`: persistence layer that stores raw bundles and materialized indexes for queries.
- `Database`: user-facing coordinator that creates bundles, talks to a store, and syncs with peers.
- `Relay` / connection classes: network layer for WebSocket sync.
- `Braid`: experimental partial view over selected chains. Useful context for authorization/projection work.

The key invariant is that peers exchange opaque bundle bytes. Even if an implementation does not understand every field in a future bundle schema, it should be able to preserve and forward the original bytes.

## Repository Map

```text
proto/
  Wire format definitions. Start here for protocol or interop work.

python/gink/
  Python package public exports and CLI entrypoint.

python/gink/impl/
  Python implementation internals: Database, stores, containers, sync, CLI helpers.

python/gink/tests/
  Python unit and integration-ish tests.

python/docs/
  Python Sphinx docs and examples.

javascript/implementation/
  TypeScript implementation internals: Database, stores, containers, sync, CLI.

javascript/unit-tests/
  TypeScript unit tests.

javascript/integration-tests/
  Cross-process and cross-language sync tests.

javascript/content_root/
  Static dashboard and generated browser bundle target.

docs/
  Internal/project docs and specs. `docs/assessment.md` is a broad codebase assessment.

.github/workflows/
  CI and publishing workflows.

Makefile
  Proto generation, TypeScript build, and basic test targets.
```

## Where To Start By Task

For protocol or cross-language compatibility:

- Read `proto/bundle.proto`, `proto/change.proto`, `proto/sync_message.proto`, `proto/muid.proto`, and `docs/muid.md`.
- Then inspect Python `python/gink/impl/decomposition.py`, `python/gink/impl/utilities.py`, and TypeScript `javascript/implementation/Decomposition.ts`, `javascript/implementation/utils.ts`.
- Prefer adding shared fixture/conformance tests over changing one implementation in isolation.

For Python user-facing behavior:

- Start with `python/gink/__init__.py` to see public exports.
- Use `python/gink/impl/database.py` for bundle creation and database-level behavior.
- Use `python/gink/impl/container.py` plus the specific container file, such as `directory.py`, `sequence.py`, or `box.py`.
- Use `python/gink/tests/test_*.py` to understand intended behavior.

For TypeScript user-facing behavior:

- Start with `javascript/implementation/index.ts` to see public exports.
- Use `javascript/implementation/Database.ts` for database and sync orchestration.
- Use the specific container file, such as `Directory.ts`, `Sequence.ts`, or `Box.ts`.
- Use `javascript/unit-tests/*.test.ts` for intended behavior.

For storage work:

- Python abstraction: `python/gink/impl/abstract_store.py`.
- Python persistent store: `python/gink/impl/lmdb_store.py`.
- Python memory/log stores: `python/gink/impl/memory_store.py`, `python/gink/impl/log_backed_store.py`.
- TypeScript abstraction: `javascript/implementation/Store.ts`.
- TypeScript browser store: `javascript/implementation/IndexedDbStore.ts`.
- TypeScript Node/file store: `javascript/implementation/LogBackedStore.ts`.
- Storage changes often affect reset, clear, movement, history retention, and sync. Check tests across both languages when changing storage semantics.

For sync/networking work:

- Protocol: `proto/sync_message.proto`.
- Python: `python/gink/impl/relay.py`, `python/gink/impl/connection.py`, `python/gink/impl/listener.py`, `python/gink/impl/server.py`.
- TypeScript: `javascript/implementation/Database.ts`, `ClientConnection.ts`, `ServerConnection.ts`, `SimpleServer.ts`, `Listener.ts`.
- Integration tests live in `javascript/integration-tests/`.

For CLI/server behavior:

- Python CLI: `python/gink/__main__.py`.
- TypeScript CLI: `javascript/implementation/main.ts` and `CommandLineInterface.ts`.
- Python WSGI support: `python/gink/impl/wsgi_listener.py`, `python/examples/`.
- Browser dashboard/static server: `javascript/content_root/` and `SimpleServer.ts`.

For docs and positioning:

- Root `README.md` gives the public overview.
- `docs/intro.md` is a slide-style conceptual intro.
- `python/README.md` and `javascript/README.md` contain user-facing examples.
- `docs/assessment.md` contains a candid internal assessment and recommended improvements.

## Important Implementation Notes

Python is intentionally synchronous and readability-biased. Do not assume it is optimized for throughput or async networking.

TypeScript APIs are generally async because browser storage and network operations are async.

Generated code comes from `proto/*.proto`. Do not hand-edit generated proto output under `python/gink/builders`, `python/gink/proto`, `javascript/proto`, or `javascript/tsc.out`.

The Python package requires Python 3.12 or newer. Some docs/config may lag behind this.

`Database.get_most_recently_created_database()` and the implicit "recent database" pattern are used throughout Python examples and constructors. This is convenient but can surprise tests and agents; pass `database=` explicitly when clarity matters.

Many stores are internal APIs. `AbstractStore` and TypeScript `Store` are not stable public contracts unless a task explicitly makes them so.

Several Python classes are marked with the `experimental` decorator but are still exported. Treat these as usable for tests/prototypes but not necessarily stable product APIs.

`LogBackedStore` in TypeScript is a practical Node persistence layer over an internal memory store and append-only log. Its own comments describe it as less ideal than a durable server-side IndexedDB/LMDB-style store.

Python CLI dump/load paths are powerful but potentially unsafe: `--load` uses Python execution semantics. Treat dumps as trusted input unless the import/export path has been redesigned.

## Build And Test Commands

Common root-level commands:

```sh
make
make test-python
make test-javascript
make test-browser
docker build .
```

Python tests:

```sh
cd python
python3 -m pytest
python3 -m pytest gink/tests/test_directory.py
```

Python lint/type checks used by the Docker build:

```sh
cd python
mypy gink/impl gink/tests
pycodestyle --max-line-length=120 --select=E501 gink/impl/*.py gink/tests/*.py
```

TypeScript tests:

```sh
cd javascript
npm run test
npm run test-integration
npm run browser-unit
npm run browser-integration
```

Build/generated artifacts:

```sh
make python/gink/builders
make javascript
```

## Testing Gotchas

Some integration tests may be disabled by an early `process.exit(0)` despite appearing in the test directory. Check the test file itself before trusting coverage for sync, chain reuse, or log-backed peer behavior.

The Dockerfile is the best snapshot of the intended full test pipeline: Python mypy/pycodestyle/pytest, TypeScript build/tests, browser tests, and integration tests.

Cross-language behavior is usually exercised from the JavaScript integration test directory because those tests spawn Python and TypeScript processes.

When changing protocol or storage semantics, run both Python and TypeScript tests if possible, not just the language you touched.

## Common Concepts By File

- Bundle construction/signing: `python/gink/impl/database.py`, `javascript/implementation/Database.ts`.
- Bundle parsing/view: `python/gink/impl/decomposition.py`, `javascript/implementation/Decomposition.ts`.
- Timestamp/medallion/MUID helpers: `python/gink/impl/utilities.py`, `python/gink/impl/muid.py`, `javascript/implementation/utils.ts`.
- Container base behavior: `python/gink/impl/container.py`, `javascript/implementation/Container.ts`.
- Key/value container: `Directory`.
- Ordered container: `Sequence`.
- Single-value container: `Box`.
- Set/map pair structures: `KeySet`, `PairSet`, `PairMap`.
- Graph structures: `Vertex`, `EdgeType`, `Edge`.
- Properties/names: `Property`, name-related tests in `test_names.py`.
- Partial chain views: `Braid`, `BraidServer`.

## Suggested Agent Workflow

1. Identify whether the task is protocol, Python API, TypeScript API, storage, sync, CLI, docs, or tests.
2. Read only the files listed for that task area above.
3. Check nearby tests before editing; this codebase encodes many intended behaviors in tests.
4. If changing shared concepts, inspect both Python and TypeScript implementations before deciding on an approach.
5. Avoid broad refactors unless the task explicitly asks for them. The codebase has many experimental surfaces and generated artifacts.
6. After edits, run the narrowest relevant tests first, then broaden if the change touches protocol, storage, or sync.

## Known Strategic Gaps

These are not necessarily bugs for every task, but agents should keep them in mind:

- External docs are incomplete relative to the implementation.
- The consistency/conflict model is not yet documented in one canonical place.
- Protocol-first claims would benefit from cross-language conformance fixtures.
- Auth exists but should not be treated as a complete production authorization model.
- Some high-risk integration paths need stronger, non-disabled tests.
- Performance comparison scripts should not be treated as authoritative benchmarks without review.

For deeper context, read `docs/assessment.md`.
