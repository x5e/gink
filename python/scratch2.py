from gink import *
from sortedcontainers import SortedDict
store = MemoryStore()
database = Database(store=store)
gdi = Directory.get_global_instance(database=database)
gdi["foo"] = "bar"
gdi["bar"] = "foo"
gdi[7] = {"cheese": "wiz", "foo": [True, False, None]}
gdi["nope"] = Directory()
gdi["nope"][33] = [1, 2]  # type: ignore
middle = database.get_now()

gdi["bar"] = "moo" 
gdi["foo"] = "zoo"
gdi[99] = 30
gdi["nope"][44] = "foo"  # type: ignore





gdi.reset(middle)
print(list(gdi.items()))
print(list(gdi.get("nope").items()))