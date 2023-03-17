""" Tests of the ChangeSetInfo class. """
from ..impl.bundle_info import BundleInfo


def test_repr_some():
    """ Makes sure that __repr__ works. """
    info = BundleInfo(timestamp=123, medallion=789, chain_start=123)
    assert repr(info) == "BundleInfo(timestamp=123, medallion=789, chain_start=123)", info

    abc = BundleInfo(timestamp=125, medallion=3, chain_start=123, previous=123, comment='x')
    xyz = "BundleInfo(timestamp=125, medallion=3, chain_start=123, previous=123, comment='x')"
    assert repr(abc) == xyz, repr(abc)


def test_order():
    """ Makes sure that BundleInfo objects get ordered correctly. """
    info1 = BundleInfo(timestamp=123, medallion=789, chain_start=123)
    info2 = BundleInfo(timestamp=124, medallion=999, chain_start=124)
    info3 = BundleInfo(timestamp=125, medallion=789, chain_start=123, previous=123)

    stuff = [info2, info1, info3]
    stuff.sort()
    assert stuff[0] == info1, stuff
    assert stuff[1] == info2, stuff
    assert stuff[2] == info3, stuff
