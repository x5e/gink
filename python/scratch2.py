from gink import *
from sortedcontainers import SortedDict
store = MemoryStore()
database = Database(store)
dir(store)
store._bundles
gd = Directory.get_global_instance()
gd["hello"] = "world"
store._bundles
len(store._bundles)
store._bundles.keys()
list(store._bundles.keys())
BundleInfo.from_bytes(list(store._bundles.keys())[0])
BundleInfo.from_bytes(list(store._bundles.keys())[1])
from gink.builders import *
from gink.impl.builders import *
bundle_builder = BundleBuilder()
bundle_builder.ParseFromString(list(store._bundles.values())[0])
bundle_builder
bundle_builder.ParseFromString(list(store._bundles.values())[1])
bundle_builder
gd["hello"] = "universe"
BundleInfo.from_bytes(list(store._bundles.keys())[2])
bundle_builder.ParseFromString(list(store._bundles.values())[2])
bundle_builder
print(len(store._placements))
# from gink.impl.coding import *
# store.get_some(PlacementKey)
# list(store.get_some(PlacementKey))