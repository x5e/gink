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
# print(list(gdi.items()))
print("FIRST RESET")
bundle = gdi.reset(middle, recursive=True)
# print(list(gdi.items()))
print("++++++++++++++FIRST CHANGES, SHOULD RETURN CHANGES++++++++++++++++++++++++++++\n", bundle._bundle_builder)
assert 44 not in gdi["nope"]  # type: ignore
assert bundle is not None and len(bundle) > 0
print("\nSECOND RESET")
bundle = gdi.reset(middle, recursive=True)

# print(list(gdi.items()))
# assert not bundle
print("++++++++++++++SECOND RESET, NO CHANGES++++++++++++++++++++++++++++\n", bundle._bundle_builder)




# print(list(gdi.items()))
# print(list(gdi.get("nope").items()))