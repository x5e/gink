""" Tests the HasMap class. """
from ..impl.bundle_info import BundleInfo
from ..impl.has_map import HasMap


def test_tracking():
    """ Tests the basic tracking functionality. """
    has_map = HasMap()
    info1 = BundleInfo(medallion=123, chain_start=345, timestamp=789)
    info2 = BundleInfo(medallion=222, chain_start=345, timestamp=789)
    info3 = BundleInfo(medallion=123, chain_start=345, timestamp=346)
    info4 = BundleInfo(medallion=222, chain_start=888, timestamp=900)
    has_map.mark_as_having(info1)
    has_map.mark_as_having(info4)
    assert not has_map.has(info2)
    assert has_map.has(info3)
    assert has_map.has(info4)


def test_to_greeting_message():
    """ Tests the too_greeting_message method of HasMap. """
    has_map = HasMap()
    info1 = BundleInfo(medallion=123, chain_start=345, timestamp=789)
    info2 = BundleInfo(medallion=222, chain_start=888, timestamp=900)
    info3 = BundleInfo(medallion=123, chain_start=888, timestamp=899)
    has_map.mark_as_having(info1)
    has_map.mark_as_having(info2)
    has_map.mark_as_having(info3)
    builder = has_map.to_greeting_message()

    entries = builder.greeting.entries  # type: ignore # pylint: disable=maybe-no-member
    assert len(entries) == 3
    assert entries[0].medallion == 123
    assert entries[0].chain_start == 345
    assert entries[0].seen_through == 789

    assert entries[1].medallion == 123
    assert entries[1].chain_start == 888
    assert entries[1].seen_through == 899

    assert entries[1].medallion == 123
    assert entries[1].chain_start == 888
    assert entries[1].seen_through == 899
