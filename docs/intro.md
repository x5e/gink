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
| NULL | null | NoneType | <pre> None |
| Boolean | boolean | bool | <pre> True
| Double | number | float | <pre>3.141592653589793 |
|  Integer | BigInt | int | <pre>73786976294838206464 |
| String | string | str | <pre>"Hello, world!"</pre> |
| Byte String | Unit8Array |  bytes | <pre>b"Hello, World!"</pre> |
| Document | Map | dict | <pre>{"name": "John Smith", "id": 134} |
| Tuple | Array | tuple | <pre> [3.7, True, {"foo": "bar"} ] |

---

<!-- _class: invert -->

| Container Type | Usage |
| :---: | :--: |
| Directory | Key / Value Store |
| Box | Holds a single value |
| Sequence | Ordered List / Queue |
| Key Set | Set Operations |
| Accumulator | Numeric Balance |
