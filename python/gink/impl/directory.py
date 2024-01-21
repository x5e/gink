""" contains the Directory class definition """
##################################################################################################0
from typing import Union, Optional, Iterable, Dict
from sys import stdout
from logging import getLogger

# gink implementation
from .muid import Muid
from .database import Database
from .container import Container
from .coding import decode_key, DIRECTORY, deletion
from .bundler import Bundler
from .typedefs import UserKey, GenericTimestamp
from .attribution import Attribution


class Directory(Container):
    """ the Gink mutable mapping object """
    _missing = object()
    BEHAVIOR = DIRECTORY

    def __init__(self, *ordered, root: Optional[bool] = None, bundler: Optional[Bundler] = None,
                 contents=None, muid: Optional[Muid] = None, database=None, comment: Optional[str] = None):
        """
        Constructor for a directory proxy.

        muid: the global id of this directory, created on the fly if None
        db: database send commits through, or last db instance created if None
        """
        self._logger = getLogger(self.__class__.__name__)

        if ordered:
            if isinstance(ordered[0], str):
                muid = Muid.from_str(ordered[0])
        if root:
            muid = Muid(-1, -1, DIRECTORY)
        database = database or Database.get_last()
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)
        if muid is None:
            muid = Container._create(DIRECTORY, database=database, bundler=bundler)
        elif muid.timestamp > 0 and contents:
            # TODO [P3] check the store to make sure that the container is defined and compatible
            pass
        Container.__init__(self, muid=muid, database=database)
        if contents:
            self.clear(bundler=bundler)
            self.update(contents, bundler=bundler)
        if immediate and len(bundler):
            self._database.commit(bundler)

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ Dumps the contents of this directory to a string.
        """
        if self._muid.medallion == -1 and self._muid.timestamp == -1:
            identifier = "root=True"
        else:
            identifier = repr(str(self._muid))
        result = f"""{self.__class__.__name__}({identifier}, contents="""
        result += "{"
        stuffing = [f"{key!r}: {val!r}" for key, val in self.items(as_of=as_of)]
        as_one_line = result + ", ".join(stuffing) + "})"
        if len(as_one_line) < 80:
            return as_one_line
        result += "\n\t"
        result += ",\n\t".join(stuffing) + "})"
        return result

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

    def has(self, key: UserKey, *, as_of=None):
        """ returns true if the given key exists in the mapping, optionally at specific time """
        as_of = self._database.resolve_timestamp(as_of)
        found = self._database.get_store().get_entry_by_key(self._muid, key=key, as_of=as_of)
        return found is not None and not found.builder.deletion  # type: ignore

    def get(self, key, default=None, *, as_of: GenericTimestamp = None):
        """ gets the value associate with a key, default if missing, optionally as_of a time """
        as_of = self._database.resolve_timestamp(as_of)
        found = self._database.get_store().get_entry_by_key(self._muid, key=key, as_of=as_of)
        if found is None or found.builder.deletion:  # type: ignore
            return default
        return self._get_occupant(found.builder, found.address)

    def set(self, key: Union[str, int], value, *, bundler=None, comment=None) -> Muid:
        """ Sets a value in the mapping, returns the muid address of the entry.

            If bundler is specified, then simply adds an entry to that bundler.
            If no bundler is specified, then creates one just for this entry,
            sets it's comment to the comment arg (if set) then adds it to the database.
        """
        return self._add_entry(key=key, value=value, bundler=bundler, comment=comment)

    def delete(self, key, *, bundler=None, comment=None):
        """ Removes a value from the mapping, returning the muid address of the change.

            If bundler is specified, then simply adds an entry to that bundler.
            If no bundler is specified, then creates one just for this entry,
            sets it's comment to the comment arg (if set) then adds it to the database.
        """
        return self._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)

    def setdefault(self, key, default=None, *, bundler=None, respect_deletion=False):
        """ Insert key with a value of default if key is not in the directory.

            Return the value for key if key is in the directory, else default.

            If respect_deletion is set to something truthy then it won't make any changes
            if the most recent entry in the directory for the key is a delete entry. In this
            case it will return whatever has been passed into respect_deletion.
        """
        as_of = self._database.get_now()
        found = self._database.get_store().get_entry_by_key(self.get_muid(), key=key, as_of=as_of)
        if found and found.builder.deletion and respect_deletion:  # type: ignore
            return respect_deletion
        if found and not found.builder.deletion:  # type: ignore
            return self._get_occupant(found.builder, found.address)
        self._add_entry(key=key, value=default, bundler=bundler)
        return default

    def pop(self, key, default=None, *, bundler=None, comment=None):
        """ If key exists in the mapping, returns the corresponding value and removes it.

            Otherwise returns default.  In the case that the key is found and removed,
            then the change is added to the bundler (or committed immedately with comment
            if no bundler is specified.)
        """
        as_of = self._database.get_now()
        found = self._database.get_store().get_entry_by_key(self.get_muid(), key=key, as_of=as_of)
        if found is None or found.builder.deletion:  # type: ignore
            return default
        self._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)
        return self._get_occupant(found.builder, found.address)

    def items(self, *, as_of=None):
        """ returns an iterable of key,value pairs, as of the effective time (or now) """
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(container=self._muid, as_of=as_of, behavior=DIRECTORY)
        for entry_pair in iterable:
            if entry_pair.builder.deletion:  # type: ignore
                continue
            key = decode_key(entry_pair.builder)
            contained = self._get_occupant(entry_pair.builder, entry_pair.address)
            yield (key, contained)

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(container=self._muid, as_of=as_of, behavior=DIRECTORY)
        count = 0
        for entry_pair in iterable:
            if entry_pair.builder.deletion:  # type: ignore
                continue
            count += 1
        return count

    def keys(self, *, as_of=None):
        """ returns an iterable of all the keys in this directory """
        for k, _ in self.items(as_of=as_of):
            yield k

    def values(self, *, as_of=None):
        """ returns a list of values in the directory as of the given time """
        for _, val in self.items(as_of=as_of):
            yield val

    def popitem(self, *, bundler=None, comment=None):
        """ Remove and return a (key, value) tuple, or raises KeyError if empty.

            Order is determined by implementation of the store.
        """
        as_of = self._database.get_now()
        iterable = self._database.get_store().get_keyed_entries(container=self._muid, as_of=as_of, behavior=DIRECTORY)
        for entry_pair in iterable:
            if entry_pair.builder.deletion:  # type: ignore
                continue
            val = self._get_occupant(entry_pair.builder, entry_pair.address)
            key = decode_key(entry_pair.builder)
            self._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)
            return (key, val)
        raise KeyError("directory is empty")

    def update(self, from_what, *, bundler=None, comment=None):
        """ Performs a shallow copy of key/value pairs from the argument.

        When from_what hasattr "keys", then will try: for k in E: D[k] = E[k]
        otherwise will try:  for k, v in E: D[k] = v

        """
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)
        if hasattr(from_what, "keys"):
            for key in from_what:
                self._add_entry(key=key, value=from_what[key], bundler=bundler)
        else:
            for key, val in from_what:
                self._add_entry(key=key, value=val, bundler=bundler)
        if immediate:
            self._database.commit(bundler)

    def blame(self, key: Optional[UserKey] = None, as_of: GenericTimestamp = None
              ) -> Dict[UserKey, Attribution]:
        """ returns a dictionary mapping keys to who's responsible for each change """
        as_of = self._database.resolve_timestamp(as_of)
        keys = [key] if key is not None else self.keys(as_of=as_of)
        result: Dict[UserKey, Attribution] = {}
        for key in keys:
            # TODO [P2]: figure out how to show blame for clear operations
            # (have get_entry_by_key return clearances)
            found = self._database.get_store().get_entry_by_key(self._muid, key=key, as_of=as_of)
            if found is None or not key:
                continue
            result[key] = self._database.get_attribution(*found.address)
        return result

    def show_blame(self, as_of: GenericTimestamp = None, file=stdout):
        """ dumps the blame map to <file> in a human-readable format """
        for key, val in self.blame(as_of=as_of).items():
            print(repr(key), str(val), file=file)


    def log(self, key: UserKey) -> Iterable[Attribution]:
        """ Get the history of modifications for a particular key. """
        as_of = self._database.get_now()
        while as_of:
            found = self._database.get_store().get_entry_by_key(self._muid, key=key, as_of=as_of)
            if not found:
                break
            yield self._database.get_attribution(*found.address)
            as_of = found.address.timestamp

    def show_log(self, key: UserKey, file=stdout, limit=10):
        """ writes the history of modifications to <file> in a human-readable format """
        for att in self.log(key):
            if limit is not None and limit <= 0:
                break
            print(str(att), file=file)
            if isinstance(limit, int):
                limit -= 1

Database.register_container_type(Directory)
