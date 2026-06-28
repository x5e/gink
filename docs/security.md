# Security And Safety Notes

This document describes trust boundaries and safety concerns that developers should understand before using Gink in applications. It is not a complete threat model.

## Short Version

Gink has building blocks for signed bundles, TLS WebSocket connections, and token-gated peer connections. Those are useful foundations, but they do not by themselves provide a complete production security model.

Before exposing a Gink process to untrusted users or networks, decide:

- Which peers are allowed to read data.
- Which peers are allowed to write data.
- Which chains or braids each peer may access.
- How keys and tokens are generated, stored, rotated, and revoked.
- How imported dumps and synced bundles are validated.
- What data must be encrypted at rest or in transit.

## Bundle Signing Is Not Authorization

Bundles are signed so peers can validate that chain data has not been modified and that a chain is being extended by someone with the corresponding signing key.

This does not answer every security question. In particular:

- A valid signature does not mean the writer is allowed to modify your application data.
- A valid chain does not mean the peer is allowed to read every other chain.
- A synced bundle can be structurally valid but still violate application policy.

Applications should enforce authorization above the bundle-validation layer.

## WebSocket Tokens

The Python and TypeScript CLIs can require an authentication token for WebSocket connections. This is useful for trusted deployments and development environments.

Treat this as a simple connection gate, not a complete identity or authorization system. Use strong random tokens, prefer TLS (`wss://`) outside local development, and avoid logging or committing tokens.

The token mechanism does not by itself provide:

- Per-container permissions.
- Per-chain permissions.
- User identity management.
- Token rotation workflows.
- Replay protection beyond the surrounding transport/protocol behavior.

## TLS

Use TLS for network sync outside local development. Without TLS, tokens and data can be observed by anyone who can inspect the network path.

Both implementations have support for secure WebSocket connections, but deployment details such as certificate management and reverse proxy configuration are application concerns.

## Dump And Load Safety

Be careful with database dump/load workflows.

The Python CLI currently supports dump formats that are convenient for trusted local workflows, but loading a dump can execute Python code. Do not load dumps from untrusted sources.

For safer interchange, prefer raw bundle sync or a future structured import/export format that treats dumps as data rather than executable code.

## REPL And Standard Input Execution

The CLIs are developer tools and may expose REPL or stdin execution behavior. That is convenient for local operation and integration tests, but it should not be exposed as a remote command surface.

If you wrap Gink in a service, keep the command interface separate from untrusted inputs.

## Browser Storage

The TypeScript browser implementation can store data in IndexedDB. Browser storage should be treated as user-local application data, not as a secure vault.

Consider:

- Other code running in the same origin may be able to access the same storage.
- Browser storage can be cleared by the user or browser.
- Sensitive data should be encrypted before being stored if the threat model requires it.
- Browser storage quotas and eviction behavior vary by browser.

## Private Keys And Symmetric Keys

Gink stores signing keys so an instance can continue a chain. Some code paths also support symmetric keys for encrypted bundle data.

Key management is a major part of any production deployment. Decide where keys live, how they are backed up, how compromised keys are revoked, and how peers discover replacement keys.

Current code should be reviewed carefully before using encrypted or key-reuse features for sensitive production data.

## WSGI And HTTP Integration

The Python implementation can serve user-provided WSGI apps. That is intentionally flexible, but Gink does not automatically make those apps safe.

A WSGI app should still implement normal web security practices:

- Validate inputs.
- Authenticate users.
- Authorize each action.
- Avoid leaking internal MUIDs or bundle data unless intended.
- Use HTTPS in production.

## Purge Is Not Global Erasure

A purge tells an implementation to remove data rather than merely hide it from current views. In a replicated system, another peer may already have retained the data or may be offline when purge is issued.

If your application has legal or product requirements around deletion, design and test that workflow across all peers and backups.

## Recommended Safe Defaults

- Keep development CLIs bound to localhost unless intentionally syncing over a network.
- Use `wss://` and strong random tokens for non-local sync.
- Treat dumps, REPL input, and stdin execution as trusted-only.
- Model authorization at the application level, not just at connection time.
- Avoid storing highly sensitive data until key management and encryption behavior are reviewed.
- Document which peers are trusted to write each application dataset.
