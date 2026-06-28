# Reference

This page is a map of the Python API surface. The generated API documentation in `all_docs` is useful once you know which class you are looking for; this page explains where to start.

## Common Imports

For examples and exploratory use:

```python
from gink import *
```

For application code, prefer explicit imports:

```python
from gink import Database, Directory, LmdbStore, Sequence, Box
```

## Database

`Database` coordinates user operations, bundle creation, the backing store, and peer connections.

Common methods:

* `Database(store=...)`: create a database over a store.
* `get_root()`: return the global root `Directory`.
* `bundler(comment=None)`: group multiple operations into one bundle.
* `reset(to_time=...)`: write changes that restore database state to a prior time.
* `dump(...)`: write a text representation of visible state.
* `show_log(...)`: print bundle attribution/history.
* `connect_to(...)`: connect to another Gink peer.
* `start_listening(...)`: listen for peer connections.

See `python.gink.impl.database` in the generated docs for method details.

## Stores

Stores persist raw bundles and query indexes.

* `LmdbStore`: persistent LMDB-backed store. Good default for local Python use.
* `LogBackedStore`: append-only file-backed store.
* `MemoryStore`: transient in-memory store for tests and experiments.

Most application code should pass a store into `Database` and then interact with containers rather than calling store methods directly.

```python
store = LmdbStore("example.db")
database = Database(store=store)
```

## Containers

Containers are the user-facing data structures.

* `Directory`: mapping from scalar keys to values or container references.
* `Box`: one value or reference.
* `Sequence`: ordered values or references.
* `KeySet`: set of scalar keys.
* `PairSet`: set of pairs of entities.
* `PairMap`: mapping from pairs of entities to values or references.
* `Property`: property values attached to described containers/entities.
* `Group`: set of described containers/entities.
* `Accumulator`: delta-based numeric total.
* `Vertex`, `EdgeType`, `Edge`: graph-oriented structures.

Most containers support:

* `as_of` reads for history.
* `clear()`.
* `reset(to_time=...)`.
* optional `bundler=` and `comment=` arguments on mutating methods.

## MUIDs

`Muid` is the identifier type used for bundles, containers, and entries. It combines timestamp, medallion, and offset.

Use `Muid.from_str(...)` to parse string forms. See `docs/muid.md` for the full format.

## Bundlers

By default, most mutating operations immediately commit their own bundle. Use a bundler when a group of changes should be recorded atomically with one comment.

```python
with database.bundler("create project"):
    project = Directory(database=database)
    project["name"] = "example"
    database.get_root()["project"] = project
```

The active bundler is thread-local. Avoid nesting bundler contexts.

## Timestamps And History

Many methods accept `as_of`. You can pass absolute timestamps, date-like values, or relative negative positions depending on the method.

Use `generate_timestamp()` when you need to capture a point between operations:

```python
box = Box(database=database, contents="before")
checkpoint = generate_timestamp()
box.set("after")

assert box.get(as_of=checkpoint) == "before"
```

Historical reads depend on the store retaining history.

## CLI

The Python CLI entry point is:

```sh
python3 -m gink [db_path] [options]
```

Common operations:

```sh
printf 'hello' | python3 -m gink example.db --set greeting --string
python3 -m gink example.db --get greeting --string
python3 -m gink example.db --log
python3 -m gink example.db --listen_on 8080 --loop
python3 -m gink example.db --connect_to ws://localhost:8080 --loop
```

Security note: treat `--load`, dumps intended for `eval`, and stdin execution as trusted-only workflows. See `docs/security.md`.

## Conceptual References

Read these project-level docs when behavior is unclear:

* `docs/architecture.md`
* `docs/data_model.md`
* `docs/consistency.md`
* `docs/syncing.md`
* `docs/security.md`
