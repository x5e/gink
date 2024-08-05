from typing import Optional, Iterable, Union, Tuple
from typeguard import typechecked
from random import randint

# gink implementation
from .builders import ChangeBuilder
from .typedefs import GenericTimestamp, MuTimestamp, UserValue
from .container import Container
from .muid import Muid
from .database import Database
from .bundler import Bundler
from .coding import SEQUENCE
from .tuples import PositionedEntry, SequenceKey
from .utilities import generate_timestamp


class Sequence(Container):
    BEHAVIOR = SEQUENCE

    @typechecked
    def __init__(
            self,
            muid: Optional[Union[Muid, str]] = None,
            *,
            arche: Optional[bool] = None,
            contents: Optional[Iterable[Union[UserValue, Container]]] = None,
            database: Optional[Database] = None,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None,
    ):
        """
        Constructor for a sequence proxy.

        muid: the global id of this container, created on the fly if None
        arche: whether this will be the global version of this container (accessible by all databases)
        contents: prefill the sequence with an iterable of values upon initialization
        database: database send bundles through, or last db instance created if None
        bundler: the bundler to add changes to, or a new one if None and immediately commits
        comment: optional comment to add to the bundler
        """
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)

        Container.__init__(
                self,
                behavior=SEQUENCE,
                muid=muid,
                arche=arche,
                database=database,
                bundler=bundler,
        )
        if contents is not None:
            self.clear(bundler=bundler)
            self.extend(contents, bundler=bundler)
        if immediate and len(bundler):
            self._database.bundle(bundler)

    def __iter__(self):
        for thing in self.values():
            yield thing

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        if self._muid.medallion == -1 and self._muid.timestamp == -1:
            identifier = "arche=True"
        else:
            identifier = f"muid={self._muid!r}"
        result = f"""{self.__class__.__name__}({identifier}, contents=["""
        stuffing = [repr(val) for val in self.values(as_of=as_of)]
        as_one_line = result + ", ".join(stuffing) + "])"
        if len(as_one_line) < 80:
            return as_one_line
        result += "\n\t"
        result += ",\n\t".join(stuffing) + "])"
        return result

    @typechecked
    def append(
            self,
            value: Union[UserValue, Container], *,
            expiry: GenericTimestamp = None,
            bundler=None,
            comment=None
    ) -> Muid:
        """ Append value to the end of the queue.

            If expiry is set, the added entry will be removed at the specified time.
        """
        return self._add_entry(value=value, bundler=bundler, comment=comment, expiry=expiry)

    @typechecked
    def insert(
            self,
            index: int,
            value: Union[UserValue, Container],
            expiry: GenericTimestamp = None,
            bundler=None,
            comment=None
    ) -> Muid:
        """ Inserts value before index.

            The resulting entry expires at expiry time if specified, which must be in the future.

            If no bundler is passed, applies the changes immediately, with comment.
            Otherwise, just appends the necessary changes to the passed bundler.

            returns the muid of the entry
        """
        return self._add_entry(
            value=value,
            effective=self._position(before=index),
            bundler=bundler,
            comment=comment,
            expiry=expiry)

    @typechecked
    def extend(
            self,
            iterable: Iterable[Union[UserValue, Container]], *,
            expiries: Union[GenericTimestamp, Iterable[GenericTimestamp]] = None,
            bundler=None,
            comment=None,
    ):
        """ Adds all of the items in iterable at once to this sequence.

            expiries, if present, may be either a single expiry to be applied to all new entries,
            or a iterable of expiries of the same length as the data

            Since all items will be appended to the sequence in the same transaction, they will
            all have the same timestamp, and so it won't be possible to move anything between them.

            returns the bundler (either passed or created on the fly)
        """
        immediate = False
        if not isinstance(bundler, Bundler):
            immediate = True
            bundler = Bundler(comment)
        items = list(iterable)
        if hasattr(expiries, "__iter__"):
            expiries = list(expiries)  # type: ignore
        for i in range(len(items)):
            if isinstance(expiries, list):
                expiry = expiries[i]
            else:
                expiry = expiries
            expiry = self._database.resolve_timestamp(expiry) if expiry else None  # type: ignore
            self._add_entry(value=items[i], bundler=bundler, expiry=expiry)
        if immediate and len(bundler):
            self._database.bundle(bundler)
        return bundler

    @typechecked
    def yank(self, muid: Muid, *, dest: GenericTimestamp = None, bundler=None, comment=None) -> Muid:
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
        if dest == -1:
            dest = generate_timestamp()
        elif isinstance(dest, int) and dest < 1e15:
            dest = self._position(before=dest) if dest >= 0 else self._position(after=dest)
        elif dest is None:
            dest = 0
        else:
            dest = self._database.resolve_timestamp(dest)
        assert isinstance(dest, int)
        movement_builder.dest = dest
        muid = bundler.add_change(change_builder)
        if immediate:
            self._database.bundle(bundler)
        return muid

    @typechecked
    def pop(self, index: int = -1, *, dest: GenericTimestamp = None, bundler=None, comment=None):
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

    @typechecked
    def remove(
        self,
        value: Union[UserValue, Container], *,
        dest: GenericTimestamp = None,
        bundler=None,
        comment=None
    ) -> Muid:
        """ Remove first occurance of value.

            Raises ValueError if the value is not present.
        """
        as_of = self._database.resolve_timestamp()
        for positioned in self._database.get_store().get_ordered_entries(self._muid, as_of):
            found = self._get_occupant(positioned.builder, positioned.entry_muid)
            if found == value:
                return self.yank(positioned.entry_muid, dest=dest,
                                 bundler=bundler, comment=comment)
        raise ValueError("matching item not found")

    def items(self, *, as_of: GenericTimestamp = None) -> Iterable[Tuple[SequenceKey, Union[UserValue, Container]]]:
        """ Returns pairs of (muid, contents) for the sequence at the given time.
        """
        as_of = self._database.resolve_timestamp(as_of)
        for positioned in self._database.get_store().get_ordered_entries(self._muid, as_of=as_of):
            found = self._get_occupant(positioned.builder, positioned.entry_muid)
            sequence_key = SequenceKey(positioned.position, positioned.entry_muid)
            yield sequence_key, found

    def keys(self, *, as_of: GenericTimestamp = None) -> Iterable[SequenceKey]:
        for key, _ in self.items(as_of=as_of):
            yield key

    def values(self, *, as_of: GenericTimestamp = None) -> Iterable[Union[UserValue, Container]]:
        for _, val in self.items(as_of=as_of):
            yield val

    def __getitem__(self, what):
        """ Gets the specified item, either index counting up from
            zero, or negative number when counting from end,
            or whatever is found at an address in case of muid.
        """
        return self.at(what)[1]

    @typechecked
    def at(self, index: int, *, as_of: GenericTimestamp = None):
        """ Returns the ((position-ts, entry-muid), value) at the specified index.

            Index may be negative, in which case starts looking at the end.
            Raises IndexError if not present.
        """
        as_of = self._database.resolve_timestamp(as_of)
        offset = ~index if index < 0 else index
        iterable = self._database.get_store().get_ordered_entries(
            self._muid, as_of=as_of, limit=1, offset=offset, desc=(index < 0))
        for positioned in iterable:
            assert isinstance(positioned, PositionedEntry)
            found = self._get_occupant(positioned.builder, positioned.entry_muid)
            sequence_key = SequenceKey(positioned.position, positioned.entry_muid)
            return sequence_key, found
        raise IndexError(f"could not find anything at index {index}")

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        """ Tells the size at the specified as_of time.
        """
        as_of = self._database.resolve_timestamp(as_of)
        count = 0
        for _ in self._database.get_store().get_ordered_entries(self._muid, as_of=as_of):
            count += 1
        return count

    @typechecked
    def index(self, value: Union[UserValue, Container], start=0, stop=None, *, as_of: GenericTimestamp = None) -> int:
        """ Return the first index of the value at the given time (or now).

            Raises a ValueError if the value isn't present and raise_if_missing is True,
            otherwise just returns None.
        """
        as_of = self._database.resolve_timestamp(as_of)
        index = start
        iterable = self._database.get_store().get_ordered_entries(self._muid, as_of, offset=start)
        for positioned in iterable:
            found = self._get_occupant(positioned.builder, positioned.entry_muid)
            if found == value:
                return index
            if stop is not None and index >= stop:
                break
            index += 1
        raise ValueError("matching item not found")

    @typechecked
    def __contains__(self, item: Union[UserValue, Container]) -> bool:
        """ Returns true if something matching item is in queue. """
        try:
            self.index(item)
            return True
        except ValueError:
            return False

    def _position(self, after: Optional[int] = None, before: Optional[int] = None) -> MuTimestamp:
        """ Gets a new position after or before the index of an existing entry. """
        if after is None and before is None:
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
        if p2 - p1 < 2:
            raise ValueError("not enough space between them")
        return randint(p1 + 1, p2 - 1)


Database.register_container_type(Sequence)
