# Development

This guide covers the common local development workflow. The most complete build path is Docker; the manual setup instructions are Debian-oriented but also describe the moving parts for other systems.

Before changing implementation code, read:

* `OVERVIEW.md` for a fast codebase map.
* `docs/architecture.md` for the main system layers.
* `docs/data_model.md` for protocol concepts.
* `docs/consistency.md` for history and convergence semantics.
* `docs/syncing.md` for peer sync.

## Build with Docker

To run the entire build process for both TypeScript and Python: \
Ensure you have Docker installed and you are in the root directory of gink.

```sh
docker build .
```

This builds everything and runs tests and linters. This is the best single command to check whether both implementations still work together.

## Build without Docker

This project uses a Makefile to handle most build steps, including generated protobuf code. Do not hand-edit generated code.

Before you start, ensure you have:

* Python 3.12 or newer.
* Node.js and npm.
* `make`.
* `protobuf-compiler`.
* `curl`.

### Prerequisites

```sh
apt-get install make protobuf-compiler curl -y
```

This process assumes you have npm, pip, and Python venv installed.

```sh
apt-get install npm python3-pip python3-venv -y
```

### Install dependencies

```sh
make install-debian-packages && \
make javascript/node_modules
```

If you are not on Debian, install equivalent system packages manually and then run:

```sh
make javascript/node_modules
```

### Generated files

The protocol buffers in `proto/` generate code for both implementations.

```sh
make python/gink/builders
make javascript
```

Common generated/build output includes:

* `python/gink/builders`
* `javascript/proto`
* `javascript/tsc.out`
* `javascript/content_root/generated`

Regenerate those artifacts through `make` instead of editing them directly.

### Python

#### Running tests

Ensure you are in the `gink/python` directory.

Run all unit tests

```sh
python3 -m pytest
```

Run a specific unit test

```sh
python3 -m pytest gink/tests/test_module.py::test_name
```

Run integration tests

```sh
./../javascript/integration-tests/run_integration_tests.sh
```

#### Linting and formatting

Run the mypy linter

```sh
mypy gink/impl gink/tests
```

You may need to install missing types with

```sh
mypy --install-types
```

Ensure you do not have any lines greater than 120

```sh
pycodestyle --max-line-length=120 --select=E501 gink/impl/*.py gink/tests/*.py

```

### TypeScript

#### Running tests

Ensure you are in the `gink/javascript` directory.

Unit tests via Node.js

```sh
npm run test
```

Unit tests via Browser

```sh
npm run browser-unit
```

If this test fails to launch a Chrome process, try setting the CHROME_BIN env variable to your path to Chrome. For example:

```sh
export CHROME_BIN=/usr/bin/chromium
```

\
Integration tests

```sh
npm run test-integration
```

Browser integration tests

```sh
npm run browser-integration
```

It is recommended you start with running the Node unit tests, then the integration tests. Before you push, run `docker build .` to ensure everything is working together.

## Documentation Changes

Most high-level project documentation lives in `docs/` and root-level Markdown files. Python user docs live in `python/docs/` and are built with Sphinx/MyST. TypeScript user docs are generated separately from the TypeScript package/docs pipeline.

When updating examples:

* Prefer explicit store and database construction.
* In Python, pass `database=database` when creating containers in examples.
* In TypeScript, construct databases with `new Database({ store })`.
* Avoid examples that rely on generated files or build output being checked in.
* Mention security caveats for dump/load, REPL, network listeners, and auth tokens when relevant.
