from typing import Optional, Iterable, Union
from random import randint

from ..builders.change_pb2 import Change as ChangeBuilder

# gink implementation
from .typedefs import GenericTimestamp, MuTimestamp
from .container import Container
from .muid import Muid
from .database import Database
from .bundler import Bundler
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
        bundler = Bundler()
        if muid is None:
            muid = Sequence._create(
                Sequence.BEHAVIOR, database=database, bundler=bundler)
        Container.__init__(self, muid=muid, database=database)
        self._muid = muid
        self._database = database
        if contents:
            # TODO: implement clear, then append all of the items
            raise NotImplementedError()
        if len(bundler):
            self._database.add_bundle(bundler)
    
    def __iter__(self):
        for thing in self.values():
            yield thing

    def append(self, thing, expiry: GenericTimestamp = None, bundler=None, comment=None):
        """ Append obect to the end of the queue.

            If expiry is set, the added entry will be removed at the specified time.
        """
        now = self._database.get_now()
        expiry = self._database.resolve_timestamp(expiry) if expiry is not None else 0
        if expiry and expiry < now:
            raise ValueError("can't set an expiry to be in the past")
        return self._add_entry(value=thing, bundler=bundler, comment=comment, expiry=expiry)

    def insert(self, index: int, object, expiry: GenericTimestamp=None, bundler=None, comment=None):
        """ Inserts object before index.  
        
            The resulting entry expires at expiry time if specified, which must be in the future.

            If no bundler is passed, applies the changes immediately, with comment.
            Otherwise just appends the necessary changes to the passed bundler.

            Note that this requires two changes under the hood (basically an append then move),
            so it returns the bundler (either passed or created) rather than a single change muid.
        """
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)
        now = self._database.get_now()
        expiry = self._database.resolve_timestamp(expiry) if expiry is not None else 0
        if expiry and expiry < now:
            raise ValueError("The expiry can't be in the past!")
        entry_muid = self._add_entry(value=object, bundler=bundler, expiry=expiry)
        self.yank(entry_muid, dest=self._position(before=index) * 1.0, bundler=bundler)
        if immediate:
            self._database.add_bundle(bundler)
        return bundler

    def extend(self, iterable, expiries: Union[GenericTimestamp, Iterable[GenericTimestamp]]=None,
             bundler=None, comment=None):
        """ Adds all of the items in iterable at once to this sequence.
        
            expiries, if present, may be either a single expiry to be applied to all new entries,
            or a iterable of expiries of the same length as the data

            Since all items will be appended to the sequence in the same transaction, they will
            all have the same timestamp, and so it won't be possible to move anything between them.

            returns the bundler (either passed or created on the fly)
        """
        immediate = not bool(bundler)
        if immediate:
            bundler = Bundler(comment)
        items = list(iterable)
        if hasattr(expiries, "__iter__"):
            listed_expiries = list(expiries) # type: ignore
        else:
            listed_expiries = [expiries for _ in range(len(items))]
        for i in range(len(items)):
            expiry: GenericTimestamp = listed_expiries[i] # type: ignore
            expiry = self._database.resolve_timestamp(expiry) if expiry is not None else 0
            return self._add_entry(value=items[i], bundler=bundler, expiry=expiry)
        if immediate:
            self._database.add_bundle(bundler)
        return bundler

    def yank(self, muid: Muid, *, dest: GenericTimestamp = None, bundler=None, comment=None):
        """ Removes or moves an entry by muid.

            muid: what to move
            bundler: what to add this change to
            comment: make an immediate change with this comment
            dest: new location in the list or time in the future; integer values are interpreted 
                to be before the given index if positive or after the given index if negative

            returns: the muid of the change
        """
        immediate = False
        if not isinstance(bundler, Bundler):
            immediate = True
            bundler = Bundler(comment)
        change_builder = ChangeBuilder()
        movement_builder = change_builder.movement  # type: ignore
        self._muid.put_into(movement_builder.container)
        muid.put_into(movement_builder.entry)
        if isinstance(dest, int):
            dest = self._position(before=dest) if dest >= 0 else self._position(after=dest)
        elif dest is None:
            dest = 0
        else:
            dest = self._database.resolve_timestamp(dest)
        movement_builder.dest = dest
        muid = bundler.add_change(change_builder)
        if immediate:
            self._database.add_bundle(bundler)
        return muid

    def pop(self, index=-1, *, dest: GenericTimestamp = None, bundler=None, comment=None):
        """ (Re)move and return an item at index (default last). 

            If nothing exists at the specified index will raise an IndexError.
            If bundler is specified, simply adds the change to that, otherwise applies it.
            If comment is specified and no bundler then will make change with that comment.
            
            If dest is specified, it may be a time to hid the entry until, or a time in the past
            to reposition the entry to (the list is ordered by timestamps).
        """
        sequence_key, entry_value = self.at(index)
        self.yank(sequence_key.entry_muid, dest=dest, bundler=bundler, comment=comment)
        return entry_value

    def remove(self, value, *, dest: GenericTimestamp = None, bundler=None, comment=None):
        """ Remove first occurance of value. 

            Raises ValueError if the value is not present.
        """
        as_of = self._database.resolve_timestamp()
        for positioned in self._database._store.get_ordered_entries(self._muid, as_of):
            found = self._interpret(positioned.entry_data, positioned.entry_muid)
            if found == value:
                return self.yank(positioned.entry_muid, dest=dest, 
                    bundler=bundler, comment=comment)
        raise ValueError("matching item not found")
            
    def items(self, *, as_of: GenericTimestamp = None) -> Iterable:
        """ Returns pairs of (muid, contents) for the sequence at the given time.
        """
        as_of = self._database.resolve_timestamp(as_of)
        for positioned in self._database._store.get_ordered_entries(self._muid, as_of=as_of):
            found = self._interpret(positioned.entry_data, positioned.entry_muid)
            sequence_key = SequenceKey(positioned.position, positioned.entry_muid)
            yield (sequence_key, found)
    
    def keys(self, *, as_of: GenericTimestamp = None) -> Iterable[SequenceKey]:
        for key, _ in self.items(as_of=as_of):
            yield key

    def values(self, *, as_of: GenericTimestamp = None) -> Iterable:
        for _, val in self.items(as_of=as_of):
            yield val

    def __getitem__(self, what):
        """ Gets the specified item, either index counting up from 
            zero, or negative number when counting from end,
            or whatever is found at an address in case of muid.
        """
        return self.at(what)[1]

    def at(self, index: int, *, as_of: GenericTimestamp = None):
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

    def size(self, *, as_of: GenericTimestamp = None):
        """ Tells the size at the specified as_of time.
        """
        as_of = self._database.resolve_timestamp(as_of)
        count = 0
        for _ in self._database._store.get_ordered_entries(self._muid, as_of=as_of):
            count += 1
        return count

    def index(self, value, start=0, stop=None, *, as_of: GenericTimestamp = None) -> int:
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

    def _position(self, after: Optional[int] = None, before: Optional[int] = None) -> MuTimestamp:
        """ Gets a new position after or before the index of an existing entry. """
        if (after is None and before is None):
            raise ValueError("need to specify at least one index")
        if before is None:
            assert after is not None
            if after >= 0:
                try:
                    self.at(after + 1)
                    before = after + 1
                except IndexError:
                    after = -1
        if before == 0:
            assert after is None
            position = self.at(0)[0][0]
            return position - randint(0, int(1e6))
        if after == -1:
            assert before is None
            position = self.at(-1)[0][0]
            return position + randint(0, int(1e3))
        if after is None:
            assert before is not None
            after = before - 1
        if before is None:
            assert after is not None
            before = after + 1
        at1 = self.at(after)
        at2 = self.at(before)
        p1 = at1[0].position
        p2 = at2[0].position
        assert isinstance(p1, int)
        assert isinstance(p2, int)
        if p1 == p2:
            raise ValueError("positions in terms of time are equal")
        if p2 < p1:
            p1, p2 = p2, p1
        if p2 - p1 < 4:
            raise ValueError("not enough space between them")
        return randint(p1 + 1, p2 -1)
