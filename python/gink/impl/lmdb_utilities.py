""" A bunch of helper functions for interacting with lmdb databases. """
from typing import Optional


def count_items(cursor) -> int:
    """ Counts the number of items in the table that the cursor is associated with.

        Primarily intended to be a debugging utility.
    """
    the_count = 0
    positioned = cursor.first()
    while positioned:
        the_count += 1
        positioned = cursor.next()
    return the_count


def to_last_with_prefix(cursor, prefix, suffix=None, boundary=None) -> Optional[bytes]:
    """ Positions cursor on the last entry with prefix, optionally before boundary or prefix+suffix

        Returns the key under the cursor when something is found, None otherwise.
        If no match is found, the new position of the cursor is undefined.
    """
    # TODO write some unit tests for this (though it's got test coverage via methods that use it)
    if suffix and boundary:
        raise ValueError("don't specify both suffix and boundary")
    prefix = bytes(prefix)
    if boundary is None and suffix is None:
        if len(prefix) > 0 and prefix[-1] < 255:
            boundary = prefix[:-1] + bytes([prefix[-1] + 1])
        else:
            boundary = prefix + b"\xFF" * 40
    elif suffix is not None:
        boundary = prefix + bytes(suffix)
    elif boundary is not None:
        boundary = bytes(boundary)
    assert isinstance(boundary, bytes)
    key = None
    # first try seeking to an item immediately after the boundary
    if cursor.set_range(boundary):
        # then move to the item before that
        if cursor.prev():
            key = cursor.key()
    else:
        # if there isn't anything after that then just go to the end of the table
        if cursor.last():
            key = cursor.key()
    return key if key and key.startswith(prefix) else None
