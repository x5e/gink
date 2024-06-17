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
