# Getting Started
Gink is a versioned, eventually consistent, multi-paradigm database management system. It takes a "protocol-first" approach, which facilitates multiple implementations that can share data. In addition to some of the more complex data structures, Gink offers many data structures that mimic Python's own implementations, which you are likely very familiar with. For example, our directory, sequence, and key set operate similarly to Python's dictionary, list, and set, respectively.

## Quickstart

### Installation
Assuming you already have Python installed, install Gink by
```sh
pip3 install gink
```

### Example
Creating and using a directory

``` python
from gink import *

# Initialize document store and database
store = LmdbStore('example.db')
database = Database(store=store)

# Create a directory object (more info about this and other
# data structures can be found on their respective pages)
directory1 = Directory(database=database)

# A directory mimics the functionality of a Python dictionary
# Both of these statements set the value "bar" to the key "foo"
directory1.set("foo", "bar")
directory1["foo"] = "bar"


# Gets the value for the provided key, returns "bar"
# Again, both statements return the same value
value1 = directory.get("foo")
value2 = directory["foo"]

```

Take a look at the examples section to get started with some of the other data structures.

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

#### --format [option]
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

#### --log [number]
Show LOG entries from log (e.g. last ten entries as LOG=-10)

#### --listen_on, -l [ip:port]
Start listening on ip:port (default *:8080)

#### --connect_to, -c [url]
Remote instances to connect to (e.g. ws://localhost:8080)

#### --show_arguments
Prints arguments to stdout

#### --show_bundles
Prints all bundles in the database to stdout

#### --line_mode
Read lines of input from stdin

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
