""" Tests the ChainTracker class. """
from ..impl.bundle_info import BundleInfo
from ..impl.chain_tracker import ChainTracker


def test_tracking():
    """ Tests the basic tracking functionality. """
    chain_tracker = ChainTracker()
    info1 = BundleInfo(medallion=123, chain_start=345, timestamp=789)
    info2 = BundleInfo(medallion=222, chain_start=345, timestamp=789)
    info3 = BundleInfo(medallion=123, chain_start=345, timestamp=346)
    info4 = BundleInfo(medallion=222, chain_start=888, timestamp=900)
    chain_tracker.mark_as_having(info1)
    chain_tracker.mark_as_having(info4)
    assert not chain_tracker.has(info2)
    assert chain_tracker.has(info3)
    assert chain_tracker.has(info4)


def test_to_greeting_message():
    """ Tests the too_greeting_message method of ChainTracker. """
    chain_tracker = ChainTracker()
    info1 = BundleInfo(medallion=123, chain_start=345, timestamp=789)
    info2 = BundleInfo(medallion=222, chain_start=888, timestamp=900)
    info3 = BundleInfo(medallion=123, chain_start=888, timestamp=899)
    chain_tracker.mark_as_having(info1)
    chain_tracker.mark_as_having(info2)
    chain_tracker.mark_as_having(info3)
    builder = chain_tracker.to_greeting_message()

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
