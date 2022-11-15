from ChangeSetInfo import ChangeSetInfo

def test_repr_some():
    v1 = ChangeSetInfo(timestamp=123, medallion=789, chain_start=123)
    assert repr(v1) == "ChangeSetInfo(timestamp=123, medallion=789, chain_start=123)", v1

def test_order():
    v1 = ChangeSetInfo(timestamp=123, medallion=789, chain_start=123)
    v2 = ChangeSetInfo(timestamp=124, medallion=999, chain_start=124)
    v3 = ChangeSetInfo(timestamp=125, medallion=789, chain_start=123, prior_time=123)

    stuff = [v2, v1, v3]
    stuff.sort()
    assert stuff[0] == v1, stuff
    assert stuff[1] == v2, stuff
    assert stuff[2] == v3, stuff
