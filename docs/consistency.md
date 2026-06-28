# Consistency, History, And Conflict Behavior

Gink is eventually consistent. It does not try to make every peer agree before accepting a local write. Instead, each peer accepts local bundles, exchanges bundles with other peers, and materializes the same visible state once it has the same set of accepted bundles.

This document explains the intended mental model. Some details are implementation-specific today, so protocol and storage changes should still be checked against tests in both Python and TypeScript.

## Local Writes

A local write creates a `Change`, wraps it in a signed `Bundle`, and appends that bundle to the local writer's chain. Most container operations commit immediately unless a bundler is supplied.

In Python:

```python
with database.bundler("create user record"):
    user = Directory(database=database)
    user["name"] = "Ada"
    database.get_root()["users/ada"] = user
```

In TypeScript:

```ts
const bundler = await database.startBundle({ comment: "create user record" });
const user = await Directory.create(database, { bundler });
await user.set("name", "Ada", { bundler });
await database.getRoot().set("users/ada", user, { bundler });
await bundler.commit();
```

Bundling matters because all changes in the bundle share the same timestamp and are meant to be applied atomically.

## Eventual Convergence

Peers converge when they have the same valid bundles and apply the same deterministic materialization rules. Sync does not require every peer to be online at the same time. A peer can write offline, reconnect later, and send the missing bundles.

Convergence depends on:

- Valid bundle signatures and chain links.
- Deterministic MUID ordering.
- Deterministic container-specific interpretation of entries, movements, clearances, and purges.
- Implementations preserving raw bundle bytes across sync.

## Mapping-Like Containers

Mapping-like containers include `Directory`, `KeySet`, `Property`, `Group`, `PairSet`, and `PairMap`.

For these containers, a later visible entry for the same logical key replaces or hides an earlier one. A deletion is represented as another entry that marks the key as deleted. Historical reads can still see older values if history was retained.

This means concurrent writes are not semantically merged field-by-field. If two peers write different values for the same key, the visible value is the one selected by the deterministic ordering of accepted entries. This is closer to last-writer-wins by Gink ordering than to a JSON CRDT merge.

Application designers should avoid using one hot key as a collaboration point unless last-writer-wins behavior is acceptable. When independent contributions should be preserved, model them as separate entries in a `Sequence`, distinct keys in a `Directory`, or separate containers referenced from a shared root.

## Ordered Containers

`Sequence` and edge-like structures use an effective timestamp plus a positioning change to determine order. Entries can be moved. A movement without a destination removes the entry from the current sequence view.

Because order is derived from MUID-like data rather than local array indexes alone, peers can converge on the same order after exchanging bundles.

Sequences are useful for append-oriented data, queues, event logs, and work lists. They are not currently positioned as collaborative rich-text CRDTs.

## Clear, Reset, And Purge

`clear` creates a new clearance change. The container becomes empty after that point, but older data can still be visible through historical reads if history is retained.

`reset` is not a destructive rewind. It writes a new bundle that restores container or database state to what it looked like at an earlier time. Because reset itself is a normal change, users can still inspect the state before the reset.

`purge` is different. Purge is intended for permanent removal of data rather than ordinary history-preserving deletion. Use it carefully, especially in synced systems where other peers may already have retained data.

## As-Of Reads

Many APIs accept an `as_of` or `asOf` argument. It can be an absolute timestamp or a relative negative index, depending on implementation.

Examples of what as-of reads are good for:

- Showing an older value.
- Building audit views.
- Checking what changed between two points.
- Implementing reset or restore flows.

As-of reads only work for data that the local store retained. If history has been dropped or was never retained, older state may not be reconstructable.

## Clocks And Timestamps

Gink uses microsecond timestamps in MUIDs and bundles. Implementations try to generate monotonically increasing local timestamps, but distributed peers can still have skewed clocks.

Clock skew does not prevent convergence, because peers sort the same accepted bundle identifiers the same way. It can affect user expectations about "latest" when two independent peers write around the same real-world time. Applications that need stronger semantic conflict handling should model conflicts explicitly rather than relying only on timestamp order.

## Chain Integrity

Bundles in a writer chain include links to previous chain state and are signed. This protects against accidental or malicious mutation of already-sealed bundle bytes, assuming peers validate signatures and chain continuity before accepting data.

Signing proves continuity of a chain key; it is not the same as application-level authorization. A validly signed bundle may still be from a peer that an application should not trust for a particular dataset.

## Modeling Advice

Prefer append-oriented models when multiple peers can write independently. A shared sequence of facts or a directory keyed by stable unique IDs will preserve more information than repeatedly overwriting one shared key.

Use comments and bundlers for meaningful operations. A bundle comment is the closest equivalent to a commit message and is useful for logs, blame, and debugging.

Keep root/global containers small and intentional. Use them to find application containers, not as the entire application database.

Use purges only when the application truly requires permanent deletion. Ordinary delete and clear operations are history-preserving when history is retained.

Document any application-level conflict policy above Gink. Gink can provide deterministic convergence, but the application still owns domain semantics.
