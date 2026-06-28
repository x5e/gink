# Syncing And Sharing Gink Databases

Gink instances sync by exchanging signed bundles over WebSockets. Sync is intentionally bundle-oriented rather than API-oriented: peers do not ask each other to "set key X"; they exchange the durable bundle bytes that already represent committed changes.

## Basic Model

Each database instance can create one or more writer chains. A chain is identified by a medallion and chain-start timestamp. Each bundle extends a chain and contains enough metadata for peers to verify ordering and continuity.

When two peers connect:

1. Each peer sends a greeting describing the chains it has and the latest bundle seen in each chain.
2. Each peer compares that greeting with its local store.
3. Each peer sends any bundles the other side is missing.
4. The receiving peer validates, stores, indexes, and acknowledges each bundle.
5. Newly received bundles are offered to other connected peers.

The sync protocol is defined in `proto/sync_message.proto`.

## Why Bundles Are Opaque Bytes

Sync messages carry bundles as raw bytes rather than as parsed protobuf objects. This is deliberate.

If a future version of the `Bundle` proto adds a field, an older peer may not understand that field. By forwarding the original bytes, the older peer can still preserve and relay data without accidentally dropping unknown fields during parse/re-serialize.

This is one of the main reasons Gink is protocol-first.

## Starting A TypeScript Server

From the `javascript` directory:

```sh
npm install
npm run build
npx gink --listen-on 8080 --data-file /tmp/gink-server.log
```

`--listen-on` starts a WebSocket listener. `--data-file` stores bundles in a `LogBackedStore`; without a data file, the CLI uses a transient database.

Connect a TypeScript client:

```ts
import { Database, IndexedDbStore } from "@x5e/gink";

const store = new IndexedDbStore("client-db");
const database = new Database({ store });

await database.ready;
await database.connectTo("ws://localhost:8080").ready;
```

## Starting A Python Peer

Listen for peers:

```sh
python3 -m gink server.db --listen_on 8080 --loop
```

Connect to another peer:

```sh
python3 -m gink client.db --connect_to ws://localhost:8080 --loop
```

Use `--auth_token`, `--ssl-cert`, and `--ssl-key` when appropriate. See `docs/security.md` before exposing a listener outside local development.

## Python To TypeScript

Start a TypeScript server:

```sh
cd javascript
npx gink --listen-on 8080 --data-file /tmp/gink-server.log
```

Connect a Python peer:

```sh
python3 -m gink python-peer.db --connect_to ws://localhost:8080 --loop
```

Writes committed on either side should be exchanged as bundles. Cross-language behavior is exercised by tests in `javascript/integration-tests/`.

## Browser Sync

Browsers cannot listen for incoming WebSocket connections, but they can connect to a server peer.

```ts
import { Database, IndexedDbStore } from "@x5e/gink";

const database = new Database({
    store: new IndexedDbStore("browser-client"),
});

await database.ready;
await database.connectTo("wss://example.com/gink", {
    authToken: "replace-with-a-real-token",
}).ready;
```

For browser applications, use `IndexedDbStore` for local persistence. The browser can continue to write locally while disconnected, then sync when it reconnects.

## Token Authentication

Both CLIs support `GINK_AUTH_TOKEN` for simple token-gated connections. The TypeScript CLI uses `--auth-token`; the Python CLI uses `--auth_token`.

Example:

```sh
export GINK_AUTH_TOKEN="$(openssl rand -hex 32)"
npx gink --listen-on 8080 --data-file /tmp/gink-server.log
```

Then clients must provide the same token. In TypeScript:

```ts
await database.connectTo("wss://example.com/gink", {
    authToken: process.env.GINK_AUTH_TOKEN,
});
```

Token auth is only a connection gate. It is not a full authorization model. See `docs/security.md`.

## Type Mapping

Common values are encoded into protobuf so Python and TypeScript can exchange them.

| Gink value | TypeScript | Python | Example |
| --- | --- | --- | --- |
| Boolean | `boolean` | `bool` | `true` / `True` |
| Double | `number` | `float` | `3.141592653589793` |
| Integer | `bigint` or number-like API values | `int` | `73786976294838206464` |
| String | `string` | `str` | `"Hello, world!"` |
| Byte string | `Uint8Array` | `bytes` | `b"Hello, world!"` |
| Timestamp | `Date` or microsecond timestamp | `datetime` or microsecond timestamp | `datetime(2025, 1, 3, 21, 39, 41)` |
| Document | `Map` / object-shaped values | `dict` | `{"name": "John Smith", "id": 134}` |
| Tuple | `Array` | `tuple` | `[3.7, true, {"foo": "bar"}]` |

Exact conversions can differ by implementation and API boundary. When writing cross-language fixtures, prefer simple scalar/document values first, then add edge cases such as large integers, bytes, and timestamps.

## Operational Notes

Sync is eventually consistent. Peers converge after they exchange and accept the same bundles, but local writes do not wait for remote consensus.

A server peer can act as a relay, but Gink is not limited to one central server. Multiple peers can connect in a graph and forward bundles.

When history retention is disabled or partial, a peer may not be able to answer historical queries or provide old bundles to another peer. Think through retention policy before relying on one peer as the durable source of truth.

Connection-level authentication is separate from application authorization. A synced bundle may be valid at the protocol level but still unwanted by an application policy.

## Implementation Entry Points

Protocol:

- `proto/sync_message.proto`
- `proto/bundle.proto`

Python:

- `python/gink/impl/relay.py`
- `python/gink/impl/connection.py`
- `python/gink/impl/listener.py`

TypeScript:

- `javascript/implementation/Database.ts`
- `javascript/implementation/ClientConnection.ts`
- `javascript/implementation/ServerConnection.ts`
- `javascript/implementation/SimpleServer.ts`
