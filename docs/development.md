# Development

This guide currently only walks through setup on Debian.

## Build with Docker

To run the entire build process for both TypeScript and Python: \
Ensure you have Docker installed and you are in the root directory of gink.

```sh
docker build .
```

This builds everything and runs tests and linters. This is what is run on push to GitHub.

## Build without Docker

This project uses a Makefile to handle most of the building processes. Before we jump in, ensure you have make, protobuf-compiler, and curl installed. If not, run the following commands:

### Prerequisites

```sh
apt-get install make protobuf-compiler curl -y
```

This process assumes you have npm, pip, and python venv installed.

```sh
apt-get install npm python3-pip python3-venv -y
```

### Install dependencies

```sh
make install-debian-packages && \
make javascript/node_modules
```

### Python

#### Running tests

Ensure you are in the gink/python directory. \
\
Run all unit tests

```sh
nose2
```

Run a specific unit test

```sh
nose2 gink.tests.test_module.test_name
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

Ensure you are in the gink/javascript directory. \
\
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

It is recommended you start with running the Node unit tests, then the integration tests. Before you push, run `docker build .` to ensure everthing is working together.
