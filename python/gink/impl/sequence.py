from typing import Optional, Iterable

from change_pb2 import Change as ChangeBuilder

# gink implementation
from .typedefs import GenericTimestamp
from .container import Container
from .muid import Muid
from .database import Database
from .change_set import ChangeSet
from .coding import QUEUE
from .tuples import PositionedEntry, SequenceKey

class Sequence(Container):
    BEHAVIOR = QUEUE

    def __init__(self, *, contents=None, muid: Optional[Muid] = None, database=None):
        """
        muid: the global id of this sequence, created on the fly if None
        database: where to send commits through, or last db instance created if None
        """
        database = database or Database.last
        change_set = ChangeSet()
        if muid is None:
            muid = Sequence._create(
                Sequence.BEHAVIOR, database=database, change_set=change_set)
        Container.__init__(self, muid=muid, database=database)
        self._muid = muid
        self._database = database
        if contents:
            # TODO: implement clear, then append all of the items
            raise NotImplementedError()
        if len(change_set):
            self._database.add_change_set(change_set)

    def append(self, thing, expiry: GenericTimestamp = None, change_set=None, comment=None):
        """ Append obect to the end of the queue.

            If expiry is set, the added entry will be removed at the specified time.
        """
        expiry = self._database.resolve_timestamp(expiry) if expiry is not None else 0
        return self._add_entry(value=thing, change_set=change_set, comment=comment, expiry=expiry)

    def yank(self, muid: Muid, dest: GenericTimestamp = None, *,
             change_set=None, comment=None):
        """ Removes or moves an entry by muid.

            muid: what to move
            change_set: what to add this change to
            comment: make an immediate change with this comment
            dest: new location in the list or time in the future

            returns: the muid of the change
        """
        immediate = False
        if not isinstance(change_set, ChangeSet):
            immediate = True
            change_set = ChangeSet(comment)
        change_builder = ChangeBuilder()
        exit_builder = change_builder.exit  # type: ignore
        self._muid.put_into(exit_builder.container)
        muid.put_into(exit_builder.entry)
        exit_builder.dest = self._database.resolve_timestamp(dest) if dest else 0
        muid = change_set.add_change(change_builder)
        if immediate:
            self._database.add_change_set(change_set)
        return muid


    def pop(self, index=-1, dest: GenericTimestamp = None, change_set=None, comment=None):
        """ (Re)move and return an item at index (default last). 

            If nothing exists at the specified index will raise an IndexError.
            If change_set is specified, simply adds the change to that, otherwise applies it.
            If comment is specified and no change set then will make change with that comment.
            
            If dest is specified, it may be a time to hid the entry until, or a time in the past
            to reposition the entry to (the list is ordered by timestamps).
        """
        sequence_key, entry_value = self.at(index)
        self.yank(sequence_key.entry_muid, dest=dest, change_set=change_set, comment=comment)
        return entry_value

    def remove(self, value, dest: GenericTimestamp = None, change_set=None, comment=None):
        """ Remove first occurance of value. 

            Raises ValueError if the value is not present.
        """
        as_of = self._database.resolve_timestamp()
        for positioned in self._database._store.get_ordered_entries(self._muid, as_of):
            found = self._interpret(positioned.entry_data, positioned.entry_muid)
            if found == value:
                return self.yank(positioned.entry_muid, dest=dest, 
                    change_set=change_set, comment=comment)
        raise ValueError("matching item not found")
            
    def items(self, as_of: GenericTimestamp = None) -> Iterable:
        """ Returns pairs of (muid, contents) for the sequence at the given time.
        """
        as_of = self._database.resolve_timestamp(as_of)
        for positioned in self._database._store.get_ordered_entries(self._muid, as_of=as_of):
            found = self._interpret(positioned.entry_data, positioned.entry_muid)
            sequence_key = SequenceKey(positioned.position, positioned.entry_muid)
            yield (sequence_key, found)
    
    def keys(self, as_of: GenericTimestamp = None) -> Iterable[SequenceKey]:
        for key, _ in self.items(as_of):
            yield key

    def values(self, as_of: GenericTimestamp = None) -> Iterable:
        for _, val in self.items(as_of):
            yield val

    def __getitem__(self, what):
        """ Gets the specified item, either index counting up from 
            zero, or negative number when counting from end,
            or whatever is found at an address in case of muid.
        """
        return self.at(what)

    def at(self, index: int, as_of: GenericTimestamp = None):
        """ Returns the (muid, value) at the specified index or muid.

            Index my be negative, in which case starts looking at the end.
            Raises IndexError if not present.
        """
        as_of = self._database.resolve_timestamp(as_of)
        offset = ~index if index < 0 else index
        iterable = self._database._store.get_ordered_entries(
            self._muid, as_of=as_of, limit=1, offset=offset, desc=(index < 0))
        for positioned in iterable:
            assert isinstance(positioned, PositionedEntry)
            found = self._interpret(positioned.entry_data, positioned.entry_muid)
            sequence_key = SequenceKey(positioned.position, positioned.entry_muid)
            return (sequence_key, found)
        raise IndexError(f"could not find anything at index {index}")

    def __len__(self):
        """ Returns the current size of the list.
        """
        return self.size()

    def size(self, as_of: GenericTimestamp = None):
        """ Tells the size at the specified as_of time.
        """
        as_of = self._database.resolve_timestamp(as_of)
        count = 0
        for _ in self._database._store.get_ordered_entries(self._muid, as_of=as_of):
            count += 1
        return count

    def index(self, value, start=0, stop=None, as_of: GenericTimestamp = None) -> int:
        """ Return the first index of the value at the given time (or now).

            Raises a ValueError if the value isn't present and raise_if_missing is True,
            otherwise just returns None.
        """
        as_of = self._database.resolve_timestamp(as_of)
        index = start
        iterable = self._database._store.get_ordered_entries(self._muid, as_of, offset=start)
        for positioned in iterable:
            found = self._interpret(positioned.entry_data, positioned.entry_muid)
            if found == value:
                return index
            if stop is not None and index >= stop:
                break
            index += 1
        raise ValueError("matching item not found")

    def __contains__(self, item):
        """ Returns true if something matching item is in queue.
        """
        try:
            self.index(item)
            return True
        except ValueError:
            return False
