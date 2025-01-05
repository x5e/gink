---
marp: true
_class: invert

---

## An Introduction to Gink

---
<!-- _class: invert -->
## Gink Directories are like Python's dictionaries.
##
```

$> python3

>>> from gink import *

>>> database = Database("demo.db")

>>> example = Directory(database=database)

>>> example["some key"] = "some value"

>>> example["some key"]

'some value'
```

---
<!-- _class: invert -->

## Gink Directories can point to other Gink Directories.
##

```

$> python3

>>> from gink import *

>>> database = Database("demo.db")

>>> example = Directory()  # recent database is implied

>>> example["some key"] = "some value"

>>> example["another directory"] = Directory()
```


---
<!-- _class: invert -->

## There's a "root" directory that's always present.
##

```

$> python3

>>> from gink import *

>>> root = Database("demo.db").get_root()

>>> root["some key"] = "some value"

>>> root["some key"]

'some value'

>>> root["another directory"] = Directory()

```

---
<!-- _class: invert -->

## You can store compound data in directories.
##

```

>>> root["example document"] = {"foo": "bar", "cheese": ["fries", 123]}


>>> root["example document"]


{'foo': 'bar', 'cheese': ('fries', 123)}


>>> root["example tuple"] = [1.7, True, {"foo": "bar"}, b"\x01\x02", None]


>>> root["example tuple"]


(1.7, True, {'foo': 'bar'}, b'\x01\x02', None)

```

---

<!-- _class: invert -->
# Basic Conainer Types
| Container Type | Usage | Keyed By | Holds |
| :---: | :--: | :--: | :--: |
| Directory | Key / Value Store | ints, strings, bytes | values and/or references
| Box | Holds a single value | | one value or reference
| Sequence | Ordered List / Queue | | values and/or references
| Key Set | Set Operations | ints, strings, bytes | |
| Accumulator | Numeric Balance | | Decimal Value

---
<!-- _class: invert -->

# (By default) Gink keeps a history of all changes.
#
```
>>> root["example sequence"] = Sequence()

>>> root["example sequence"].append("foo bar")

>>> database.show_log()

2025-01-03 22:57:58-05:00  darin@pengin  added entry to Sequence 062AD965...
2025-01-03 22:57:47-05:00  darin@pengin  set Directory key='example sequence' in root
2025-01-03 22:57:47-05:00  darin@pengin  created a Sequence
```

---
<!-- _class: invert -->

# (By default) Gink keeps a history of all changes.
#
```
>>> root["example"] = Sequence()

>>> root["example"].append("foo bar")

>>> database.show_log()

2025-01-03 22:57:58-05:00  darin@pengin  added entry to Sequence 062AD965...
2025-01-03 22:57:47-05:00  darin@pengin  set Directory key='example' in root
2025-01-03 22:57:47-05:00  darin@pengin  created a Sequence
```

---
<!-- _class: invert -->

# Use your own comment and/or bundle changes.
#
```
with database.start_bundle("combining some operations") as bundler:
    sequence = Sequence(bundler=bundler)
    root.set("example", sequence, bundler=bundler)
    sequence.append("hello world", bundler=bundler)

sequence.pop(comment="removing hello world")

database.show_log()
```

.
```
2025-01-04 15:42:38-05:00  darin@pengin  removing hello world
2025-01-04 15:42:38-05:00  darin@pengin  combining some operations
```


---
<!-- _class: invert -->
# You can get data from the past.
#
```
>>> directory = Directory()

>>> directory[1234] = "very important data"

>>> directory[1234] = "something else"

>>> database.show_log()
2025-01-03 23:08:20-05:00  darin@pengin  set Directory key=1234 in 062AD9871...
2025-01-03 23:08:11-05:00  darin@pengin  set Directory key=1234 in 062AD9871...
2025-01-03 23:07:03-05:00  darin@pengin  created a Directory

>>> directory.get(1234)
'something else'

>>> directory.get(1234, as_of="2025-01-03 23:08:15-05:00")
'very important data'

```

---
<!-- _class: invert -->
# And you can reset individual containers or the whole database to a time in the past.
#
```
from gink import *
database = Database("demo.db")

directory = Directory()
directory[1234] = "very important data"
directory[1234] = "something else"

directory.reset(-1)
print(directory[1234]) # very important data

database.reset(-1)
print(directory[1234]) # something else

```

---
<!-- _class: invert -->
# Writing web backends is easy using Gink.
```
from gink import Database, Accumulator
from flask import Flask

root = Database("demo.db").get_root()
app = Flask(__name__)

if "counter" not in root:
    root["counter"] = Accumulator()

@app.route('/')
def count_hits():
    counter = root["counter"]
    counter += 1
    return str(counter)

if __name__ == '__main__':
    app.run()
```


---
<!-- _class: invert -->
# Next Week:
* syncronizing databases between servers
* sharing databases with Javascript backends
* architecture and performance considerations
