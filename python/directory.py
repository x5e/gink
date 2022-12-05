""" contains the Directory class definition """
from typing import Union, Optional

# protobuf builder
from behavior_pb2 import Behavior

# gink implementation
from muid import Muid
from tuples import EntryPair
from database import Database
from container import Container
from code_values import decode_value, decode_key

class Directory(Container):
    """ the Gink mutable mapping object """
    _missing = object()
    BEHAVIOR = Behavior.SCHEMA  # type: ignore

    def __init__(self, *, muid: Optional[Muid]=None, database: Optional[Database]=None):
        """
        Constructor for a directory proxy.

        muid: the global id of this directory, created on the fly if None
        db: database send commits through, or last db instance created if None
        """
        database = database or Database.last
        if muid is None:
            muid = Directory._create(Directory.BEHAVIOR, database=database)
        Container.__init__(self, muid=muid, database=database)
        self._muid = muid
        self._database = database

    def __eq__(self, other):
        return repr(self) == repr(other)

    def __hash__(self):
        return hash(repr(self))

    def __repr__(self):
        return f"{self.__class__.__name__}({repr(self._muid)})"

    def __contains__(self, key):
        return self.has(key)

    def __getitem__(self, key):
        result = self.get(key, default=self._missing)
        if result == self._missing:
            raise KeyError(key)
        return result

    def __setitem__(self, key, value):
        self.set(key, value)

    def __delitem__(self, key):
        self.delete(key)

    def has(self, key, as_of=None):
        """ returns true if the given key exists in the mapping, optionally at specific time """
        as_of = self._database.as_of_to_mu_ts(as_of)
        found = self._database.get_store().get_entry(self.muid(), key=key, as_of=as_of)
        return found is not None and not found.builder.deleting # type: ignore

    def get(self, key, default=None, as_of=None):
        """ gets the value associate with a key, default if missing, optionally as_of a time """
        as_of = self._database.as_of_to_mu_ts(as_of)
        found = self._database.get_store().get_entry(self.muid(), key=key, as_of=as_of)
        if found is None or found.builder.deleting:  # type: ignore
            return default
        return self._interpret(found)

    def _interpret(self, found: EntryPair):
        if found.builder.HasField("immediate"): # type: ignore
            return decode_value(found.builder.immediate) # type: ignore
        if found.builder.HasField("pointee"): # type: ignore
            muid = Muid.create(found.builder.pointee, context=found.address)  # type: ignore
            return Directory(muid=muid, database=self._database)
        raise AssertionError("missing target?\n" + str(found.builder))

    def set(self, key: Union[str, int], value, change_set=None, comment=None) -> Muid:
        """ Sets a value in the mapping, returns the muid address of the entry.

            If change_set is specified, then simply adds an entry to that change set.
            If no change_set is specified, then creates one just for this entry,
            sets it's comment to the comment arg (if set) then adds it to the database.
        """
        return self._add_entry(key=key, value=value, change_set=change_set, comment=comment)

    def delete(self, key, change_set=None, comment=None):
        """ Removes a value from the mapping, returning the muid address of the change.

            If change_set is specified, then simply adds an entry to that change set.
            If no change_set is specified, then creates one just for this entry,
            sets it's comment to the comment arg (if set) then adds it to the database.
        """
        return self._add_entry(key=key, value=self._DELETE, change_set=change_set, comment=comment)

    def setdefault(self, key, default=None, change_set=None, respect_deletion=False):
        """ Insert key with a value of default if key is not in the directory.

            Return the value for key if key is in the directory, else default.
            The change_set arg works like in directory.set when changing things.

            If respect_deletion is set to something truthy then it won't make any changes 
            if the most recent entry in the directory for the key is a delete entry. In this
            case it will return whatever has been passed into respect_deletion.
        """
        as_of = self._database.how_soon_is_now()
        found = self._database.get_store().get_entry(self.muid(), key=key, as_of=as_of)
        if found and found.builder.deleting and respect_deletion:  # type: ignore
            return respect_deletion
        if found and not found.builder.deleting:  # type: ignore
            return self._interpret(found)
        self._add_entry(key=key, value=default, change_set=change_set)
        return default

    def pop(self, key, default=None, change_set=None, comment=None):
        """ If key exists in the mapping, returns the corresponding value and removes it.

            Otherwise returns default.  In the case that the key is found and removed,
            then change_set and comment behave as they do in directory.set().
        """
        as_of = self._database.how_soon_is_now()
        found = self._database.get_store().get_entry(self.muid(), key=key, as_of=as_of)
        if found is None or found.builder.deleting: # type: ignore
            return default
        self._add_entry(key=key, value=self._DELETE, change_set=change_set, comment=comment)
        return self._interpret(found)

    def items(self, as_of=None):
        """ returns an iterable of key,value pairs, as of the effective time (or now) """
        as_of = self._database.as_of_to_mu_ts(as_of)
        store = self._database.get_store()
        iterable = store.get_keyed_entries(container=self._muid, as_of=as_of)
        result = []
        for entry_pair in iterable:
            if entry_pair.builder.deleting: # type: ignore
                continue
            result.append((decode_key(entry_pair.builder), self._interpret(entry_pair)))
        return result

    def __len__(self):
        # probably should come up with a more efficient implementation of this
        return len(self.items())

    def keys(self, as_of=None):
        """ returns an iterable of all the keys in this direcotry """
        return {k for k,_ in self.items(as_of=as_of)}

    def values(self, as_of=None):
        """ returns a list of values in the directory as of the given time """
        return [v for _,v in self.items(as_of=as_of)]

    def popitem(self, change_set=None, comment=None):
        """ Remove and return a (key, value) tuple, or raises KeyError if empty.

            Order is determined by implementation of the store.
            The change_set and comment args work as in directory.set
        """
        as_of = self._database.how_soon_is_now()
        store = self._database.get_store()
        iterable = store.get_keyed_entries(container=self._muid, as_of=as_of)
        for entry_pair in iterable:
            if entry_pair.builder.deleting: # type: ignore
                continue
            val = self._interpret(entry_pair)
            key = decode_key(entry_pair.builder)
            self._add_entry(key=key, value=self._DELETE, change_set=change_set, comment=comment)
            return (key, val)
        raise KeyError("directory is empty")
