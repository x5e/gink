from gink import *
from sortedcontainers import SortedDict
store = MemoryStore()
database = Database(store=store)
gdi = Directory.get_global_instance(database=database)
gdi["foo"] = "bar"
gdi["bar"] = "foo"
gdi[7] = {"cheese": "wiz", "foo": [True, False, None]}
gdi["nope"] = Directory()
gdi["nope"][33] = [1, 2]  # type: ignore # SHOULD GO BACK TO THIS ENTRY, INCLUDING
middle = database.get_now()

gdi["bar"] = "moo" 
gdi["foo"] = "zoo"
gdi[99] = 30
gdi["nope"][44] = "foo"  # type: ignore


# print("_________BEFORE RESET____________")
# print(list(store.get_keyed_entries(container=gdi._muid, as_of=middle, behavior=4)))
# print(list(store.get_reset_changes(to_time=middle, container=gdi._muid, user_key=None)))
gdi.reset(middle)
print(list(gdi.items()))

# print("_________AFTER RESET____________")
# print(list(store.get_keyed_entries(container=gdi._muid, as_of=0, behavior=4)))