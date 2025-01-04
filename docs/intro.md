---
marp: true

_class: invert

---

## A Quick Introduction to Gink

---
<!-- _class: invert -->

```

$> python3

>>> from gink import *

>>> root = Database("demo.db").get_root()

>>> root["some key"] = "some value"

>>> root["some key"]

'some value'

```

---
<!-- _class: invert -->

| Gink Type | Javascript| Python Type | Python Example |
| --- | ----- | ---- | --- |
| Boolean | boolean | bool | <pre>True
| Double | number | float | <pre>3.141592653589793 |
|  Integer | BigInt | int | <pre>73786976294838206464 |
| String | string | str | <pre>"Hello, world!"</pre> |
| Byte String | Unit8Array |  bytes | <pre>b"Hello, World!"</pre> |
| Timestamp | Date | datetime | <pre>datetime(2025, 1, 3, 21, 39, 41) |
| Document | Map | dict | <pre>{"name": "John Smith", "id": 134} |
| Tuple | Array | tuple | <pre> [3.7, True, {"foo": b"bar"}] |

---

<!-- _class: invert -->
# Basic Conainer Types
| Container Type | Usage | Keys | Values |
| :---: | :--: | :--: | :--: |
| Directory | Key / Value Store | ints, strings, bytes | User Values or References
| Box | Holds a single value | | User Values or References
| Sequence | Ordered List / Queue | | User Values or References
| Key Set | Set Operations | ints, strings, bytes | |
| Accumulator | Numeric Balance | | Decimal Value
