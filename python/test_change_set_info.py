""" Tests of the ChangeSetInfo class. """
from change_set_info import ChangeSetInfo

def test_repr_some():
    """ Makes sure that __repr__ works. """
    info = ChangeSetInfo(timestamp=123, medallion=789, chain_start=123)
    assert repr(info) == "ChangeSetInfo(timestamp=123, medallion=789, chain_start=123)", info

    abc = ChangeSetInfo(timestamp=125, medallion=3, chain_start=123, prior_time=123, comment='x')
    xyz = "ChangeSetInfo(timestamp=125, medallion=3, chain_start=123, prior_time=123, comment='x')"
    assert repr(abc) == xyz, repr(abc)

def test_order():
    """ Makes sure that ChangeSetInfo objects get ordered correctly. """
    info1 = ChangeSetInfo(timestamp=123, medallion=789, chain_start=123)
    info2 = ChangeSetInfo(timestamp=124, medallion=999, chain_start=124)
    info3 = ChangeSetInfo(timestamp=125, medallion=789, chain_start=123, prior_time=123)

    stuff = [info2, info1, info3]
    stuff.sort()
    assert stuff[0] == info1, stuff
    assert stuff[1] == info2, stuff
    assert stuff[2] == info3, stuff
