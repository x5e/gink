""" Contains the key set class definition """

from typing import Optional, Iterable, Container as StandardContainer, Set

from .database import Database
from .muid import Muid
from .container import Container
from .coding import KEY_SET, deletion, decode_key, inclusion
from .bundler import Bundler
from .typedefs import UserKey, GenericTimestamp
from .builders import Behavior
from .utilities import generate_timestamp

class KeySet(Container):
    _missing = object()
    BEHAVIOR = KEY_SET

    def __init__(self, arche: Optional[bool] = None, bundler: Optional[Bundler] = None, contents = None,
                 muid: Optional[Muid] = None, database = None, comment: Optional[str] = None):
        """
        Constructor for a set proxy.

        muid: the global id of this set, created on the fly if None
        db: database to send bundles through, or last db instance created if None
        """
        if arche:
            muid = Muid(-1, -1, KEY_SET)
        database = database or Database.get_last()
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)
        if muid is None:
            muid = Container._create(KEY_SET, database=database, bundler=bundler)
        elif muid.timestamp > 0 and contents:
            # TODO [P3] check the store to make sure that the container is defined and compatible (possibly for set as well?)
            pass
        Container.__init__(self, muid=muid, database=database)
        if contents:
            self.clear(bundler=bundler)
            self.update(contents, bundler=bundler)
        if immediate and len(bundler):
            self._database.bundle(bundler)

    def add(self, key: UserKey, *, bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Adds a specified value to the key set """
        return self._add_entry(key=key, value=inclusion, bundler=bundler, comment=comment)

    def update(self, keys: Iterable[UserKey], bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Adds multiple specified values to the key set """
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)
        for key in keys:
            self._add_entry(key=key, value=inclusion, bundler=bundler)
        if immediate:
            self._database.bundle(bundler)

    def contains(self, key: UserKey, as_of: GenericTimestamp=None):
        """ Returns a boolean stating whether the specified key is in the key set """
        as_of = self._database.resolve_timestamp(as_of)
        found = self._database.get_store().get_entry_by_key(self.get_muid(), key=key, as_of=as_of)

        return found is not None and not found.builder.deletion

    def discard(self, key: UserKey, bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Deletes a specified entry from the key set """
        return self._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)

    def remove(self, key: UserKey, bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Deletes a specified entry from the key set, but returns KeyError if not found """
        as_of = generate_timestamp()
        found = self._database.get_store().get_entry_by_key(self.get_muid(), key=key, as_of=as_of)
        if found is None or found.builder.deletion:
            raise KeyError("Key does not exist")
        else:
            return self._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)

    def pop(self, key: UserKey, bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ If key exists in the key set, returns it and removes it.

            Otherwise returns default.  In the case that the key is found and removed,
            then the change is added to the bundler (or committed immedately with comment
            if no bundler is specified.)
        """
        as_of = generate_timestamp()
        found = self._database.get_store().get_entry_by_key(self.get_muid(), key=key, as_of=as_of)
        if found is None or found.builder.deletion:  # type: ignore
            raise KeyError("Key not found")
        self._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)
        return decode_key(found.builder)

    def issuperset(self, subset: Iterable[UserKey], *, as_of: GenericTimestamp=None) -> bool:
        """ Returns a Boolean stating whether the key set contains the specified set or list of keys """
        for element in subset:
            if not self.contains(element, as_of=as_of):
                return False
        return True

    def issubset(self, superset: StandardContainer[UserKey], *, as_of: GenericTimestamp=None) -> bool:
        """ Returns a Boolean stating whether the key set is a subset of the specified set/list/tuple """
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self.get_muid(), behavior=self.BEHAVIOR, as_of=as_of)
        for entry_pair in iterable:
            if entry_pair.builder.deletion:
                continue
            if decode_key(entry_pair.builder) not in superset:
                return False
        return True

    def isdisjoint(self, s: Iterable[UserKey], *, as_of: GenericTimestamp=None) -> bool:
        """ Returns a boolean stating whether the key set contents overlap with the specified set/list/tuple
            Sets are disjoint if and only if their intersection is an empty set.
        """
        return not set(self.intersection(s, as_of=as_of))

    def difference(self, s: StandardContainer[UserKey], *, as_of: GenericTimestamp=None) -> Iterable[UserKey]:
        """ Returns an iterable of keys in the key set that are not in the specified sets/lists/tuples  """
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self.get_muid(), behavior=self.BEHAVIOR, as_of=as_of)
        for entry_pair in iterable:
            if entry_pair.builder.deletion:
                continue
            if decode_key(entry_pair.builder) not in s:
                yield decode_key(entry_pair.builder) # type: ignore

    def intersection(self, s: Iterable[UserKey], *, as_of: GenericTimestamp=None) -> Iterable[UserKey]:
        """ Returns an iterable with elements common to the key set and the specified iterables """
        for element in s:
            if self.contains(element, as_of=as_of):
                yield element

    def symmetric_difference(self, s: Iterable[UserKey], *, as_of: GenericTimestamp=None) -> Set[UserKey]:
        """ Returns a new set with elements in either the key set or the specified iterable, but not both. """
        elements = self.union(s, as_of=as_of)
        for element in s:
            if self.contains(element, as_of=as_of):
                elements.remove(element)
        return elements

    def union(self, s: Iterable[UserKey], *, as_of: GenericTimestamp=None) -> Set[UserKey]:
        """ Returns a new set with elements from both the key set and the specified set """
        return set(self.items(as_of=as_of)).union(s)

    def difference_update(self, s: Iterable[UserKey], bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Updates the key set, removing elements found in the specified iterables. """
        if bundler is None:
            bundler = Bundler()
        for element in s:
            if self.contains(element):
                self.remove(element, bundler=bundler, comment=comment)
        self._database.bundle(bundler)

    def intersection_update(self, s: Iterable[UserKey], bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Updates the key set, keeping only elements found in the key set and the specified iterables. """
        if bundler is None:
            bundler = Bundler()
        intersection = self.intersection(s)
        iterable = self._database.get_store().get_keyed_entries(
            container=self.get_muid(), behavior=self.BEHAVIOR, as_of=generate_timestamp())

        for entry_pair in iterable:
            if entry_pair.builder.deletion:
                continue
            key = decode_key(entry_pair.builder)
            if key and not key in intersection:
                self._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)
        self._database.bundle(bundler)

    def symmetric_difference_update(self, s: Iterable[UserKey], bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Updates the key set, keeping only elements found in either the key set or the specified set, not both. """
        sym_diff = self.symmetric_difference(s)
        iterator = self._database.get_store().get_keyed_entries(
            container=self.get_muid(), behavior=self.BEHAVIOR, as_of=generate_timestamp())
        for entry_pair in iterator:
            if entry_pair.builder.deletion:
                continue
            key = decode_key(entry_pair.builder)
            if key and key not in sym_diff:
                self.remove(key=key, bundler=bundler, comment=comment)
        self.update(sym_diff, bundler=bundler, comment=comment)

    def items(self, *, as_of: GenericTimestamp=None):
        """ returns an iterable of all items in the key set """
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=self.BEHAVIOR)
        for entry_pair in iterable:
            if entry_pair.builder.deletion:
                continue
            key = decode_key(entry_pair.builder)
            yield key

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        """ returns the number of elements contained """
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=Behavior.KEY_SET)

        count = 0
        for entry_pair in iterable:
            if not entry_pair.builder.deletion:
                count += 1
        return count

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ return the contents of this container as a string """
        as_of = self._database.resolve_timestamp(as_of)
        identifier = repr(str(self._muid))
        result = f"""{self.__class__.__name__}({identifier}, contents="""
        result += "{"
        src = self._database.get_store().get_keyed_entries(container=self._muid, behavior=self.BEHAVIOR, as_of=as_of)
        stuffing = [str(decode_key(entry_pair.builder)) for entry_pair in src]
        as_one_line = result + ",".join(stuffing) + "})"
        if len(as_one_line) < 80:
            return as_one_line
        result += "\n\t"
        result += ",\n\t".join(stuffing) + "})"
        return result

    def __len__(self):
        return self.size()

    def __iter__(self) -> Iterable[Container]:
        for element in self.items():
            yield element

    def __contains__(self, key: UserKey) -> bool:
        return self.contains(key)


Database.register_container_type(KeySet)
