# Getting Started

Gink is a versioned, eventually consistent database system. It stores changes as signed bundles and can sync those bundles between independent Python, TypeScript, Node, and browser instances.

The easiest way to start is to treat Gink as a local embedded database with familiar data structures:

* `Directory` behaves like a mutable mapping.
* `Sequence` behaves like an ordered list or queue.
* `Box` stores one value or reference.
* `KeySet`, `PairSet`, `PairMap`, `Group`, and `Property` cover more specialized relationships.

Every change is recorded in history when the store retains history. Many APIs accept `as_of` so you can inspect older state.

## Quickstart

### Installation
Assuming you already have Python installed, install Gink by
```sh
pip3 install gink
```

### Example
Creating and using a directory:

``` python
from gink import Database, Directory, LmdbStore

# Initialize document store and database
store = LmdbStore('example.db')
database = Database(store=store)

# Create a directory object (more info about this and other
# data structures can be found on their respective pages)
directory = Directory(database=database)

# A directory mimics the functionality of a Python dictionary
# Both of these statements set the value "bar" to the key "foo"
directory.set("foo", "bar")
directory["foo"] = "bar"

# Gets the value for the provided key, returns "bar"
# Again, both statements return the same value
value1 = directory.get("foo")
value2 = directory["foo"]
```

The root directory is a convenient place to keep references to application containers:

```python
root = database.get_root()
settings = Directory(database=database)

settings["theme"] = "dark"
root["settings"] = settings
```

You can group related changes into one bundle with a comment:

```python
with database.bundler("initialize project settings"):
    settings = Directory(database=database)
    settings["theme"] = "dark"
    settings["notifications"] = True
    database.get_root()["settings"] = settings
```

Take a look at the examples section to get started with the other data structures.

## Core Concepts

Gink writes are stored as bundles. A bundle is similar to a commit: it may contain one or more changes, has a timestamp, can have a comment, and becomes part of a writer chain.

Containers are the data structures you use in application code. Containers have MUID addresses and can point to each other. A `Directory` can hold a regular value such as a string or dictionary, or it can hold a reference to another Gink container.

Historical reads use `as_of`:

```python
from gink import Box, generate_timestamp

box = Box(database=database, contents="first value")
before_update = generate_timestamp()
box.set("second value")

assert box.get() == "second value"
assert box.get(as_of=before_update) == "first value"
```

For deeper background, see the project-level docs:

* `docs/architecture.md`
* `docs/data_model.md`
* `docs/consistency.md`
* `docs/syncing.md`
* `docs/security.md`

## CLI
```sh
python3 -u -m gink [arguments]
```

### Arguments

#### db_path [path]
Path to a database; created if doesn't exist

#### --verbosity, -v [option]
The log level to use \
Options: [INFO, DEBUG] - default is INFO

#### --file_format [option]
Storage file format \
Options: [lmdb, binlog] - default is lmdb

#### --set [key]
Set key/value in directory (default root directory) reading value from stdin

#### --get [key]
Get a value in the database (default root directory) and print to stdout

#### --repr
Show repr of stored value when using --get

#### --dump [option or blank]
Dump contents to stdout and exit \
Options: path or muid, or everything if blank

#### --as_of [time]
As-of time to use for dump or get operation

#### --mkdir [path]
Create a directory using path notation

#### --comment
Comment to add to modifications (set or mkdir)

#### --blame
Show blame information

#### --log
Show log entries.

#### --limit [number]
Limit how many log entries are shown.

#### --listen_on, -l [ip:port]
Start listening on ip:port (default *:8080)

#### --connect_to, -c [url]
Remote instances to connect to (e.g. ws://localhost:8080)

#### --show_arguments
Prints arguments to stdout

#### --show_bundles
Prints all bundles in the database to stdout

#### --dump_to [path]
Dump database contents to a file and exit.

#### --load [path]
Load a dump file into a database.

Warning: load currently uses Python execution semantics for dump restoration. Only load dumps from trusted sources.

#### --interactive
Force interactive mode

#### --heartbeat_to
Write on console refresh (for debugging)

#### --identity [name]
Explicitly set identity to be associated with changes. default is user@hostname.

#### --starts
Include starting bundles when showing log

#### --wsgi [module.function]
Serve module.function via wsgi

#### --wsgi_listen_on [ip:port | port]
Specify ip:port or port for WSGI server to listen on (defaults to *:8081)

#### --auth_token [token]
Auth token for connections \
Defaults to env GINK_AUTH_TOKEN

#### --ssl-cert [path]
Path to ssl certificate file \
Defaults to env GINK_SSL_CERT

#### --ssl-key [path]
Path to ssl key file \
Defaults to env GINK_SSL_KEY

#### --json
Read and write JSON values for `--set` and `--get`.

#### --string
Store stdin as a string when using `--set`; by default, stdin is stored as bytes.

### CLI safety notes

The CLI is intended for local development, trusted automation, and controlled deployments. Be careful with:

* `--load`, because dump loading should be treated as trusted input.
* Non-interactive stdin execution, because arbitrary Python input may execute.
* `--listen_on`, because network listeners should use authentication and TLS when exposed outside localhost.

See `docs/security.md` for more detail.
