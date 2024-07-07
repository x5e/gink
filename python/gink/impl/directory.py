""" contains the Directory class definition """
##################################################################################################0
from __future__ import annotations
from typing import Union, Optional, Iterable, Dict
from sys import stdout
from logging import getLogger

# gink implementation
from .muid import Muid
from .database import Database
from .container import Container
from .coding import decode_key, DIRECTORY, deletion
from .bundler import Bundler
from .typedefs import UserKey, GenericTimestamp, UserValue
from .attribution import Attribution
from .utilities import generate_timestamp


class Directory(Container):
    """ the Gink mutable mapping object """
    _missing = object()
    BEHAVIOR = DIRECTORY

    def __init__(self, *ordered,
                 arche: Optional[bool] = None,
                 bundler: Optional[Bundler] = None,
                 contents: Optional[dict]=None,
                 muid: Optional[Muid] = None,
                 database: Optional[Database]=None,
                 comment: Optional[str] = None,
                 ):
        """
        Constructor for a directory proxy.

        muid: the global id of this directory, created on the fly if None
        db: database send bundles through, or last db instance created if None
        """
        self._logger = getLogger(self.__class__.__name__)

        if ordered:
            if isinstance(ordered[0], str):
                muid = Muid.from_str(ordered[0])
        if arche:
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
            self._database.bundle(bundler)

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ Dumps the contents of this directory to a string.
        """
        if self._muid.medallion == -1 and self._muid.timestamp == -1:
            identifier = "arche=True"
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
        result = self.get(key, self._missing)
        if result == self._missing:
            raise KeyError(key)
        return result

    def __setitem__(self, key, value):
        self.set(key, value)

    def __delitem__(self, key):
        self.delete(key)

    def has(self, key, *, as_of=None):
        """ returns true if the given key exists in the mapping, optionally at specific time """
        # there's probably a more efficient way of doing this
        obj = object()
        result = self.get(key, obj, as_of=as_of)
        return result is not obj

    def get(self, key_or_keys, default=None, /, *, as_of: GenericTimestamp = None):
        """ gets the value associate with a key, default if missing, optionally as_of a time

            If `key` is a list or tuple, the get will interpret that as instructions
            to walk into subdirectories and grab the value associated with the final
            element, ignoring empty strings.  The purpose is to support uses like
            directory.get("/abc/xyz".split("/"))
        """
        resolved = self._database.resolve_timestamp(as_of)
        keys = key_or_keys if isinstance(key_or_keys, (tuple, list)) else (key_or_keys,)
        current: Union[UserValue, Container] = self
        store = self._database.get_store()
        for key in keys:
            if key == "" or key == b"":
                continue
            if not isinstance(current, Directory):
                raise KeyError(f"cannot traverse item of type: {type(current)}")
            found = store.get_entry_by_key(current._muid, key=key, as_of=resolved)
            if found is None or found.builder.deletion:  # type: ignore
                return default
            current = current._get_occupant(found.builder, found.address)
        return current

    def set(self, key_or_keys, value, /, *, bundler=None, comment=None) -> Muid:
        """ Sets a value in the mapping, returns the muid address of the entry.

            If bundler is specified, then simply adds an entry to that bundler.
            If no bundler is specified, then creates one just for this entry,
            sets it's comment to the comment arg (if set) then adds it to the database.

            If the first argument is a list or tuple, then it will walk into the relevant
            sub-directory(ies) and set the value there.
        """
        timestamp = generate_timestamp()
        raw_seq = key_or_keys if isinstance(key_or_keys, (tuple, list)) else [key_or_keys]
        keys = [key for key in raw_seq if key not in ('', b'')]
        if len(keys) < 1:
            raise ValueError(f"invalid argument to set: {key_or_keys}")
        final_key = keys.pop()
        current = self
        store = self._database.get_store()
        immediate = bundler is None
        bundler = Bundler(comment=comment) if bundler is None else bundler
        for key in keys:
            found = store.get_entry_by_key(current._muid, key=key, as_of=timestamp)
            if found is None or found.builder.deletion:  # type: ignore
                new_directory = Directory(bundler=bundler, database=self._database)
                current._add_entry(key=key, value=new_directory, bundler=bundler)
                current = new_directory
            else:
                occupant = current._get_occupant(found.builder, found.address)
                if isinstance(occupant, Directory):
                    current = occupant
                else:
                    raise ValueError(f"cannot set in a non directory: {type(current)}")
        muid = current._add_entry(key=final_key, value=value, bundler=bundler)
        if immediate:
            self._database.bundle(bundler)
        return muid

    def walk(self, path: Iterable[UserKey], /, *, as_of: GenericTimestamp = None) -> Directory:
        default = object()
        current: Directory = self
        for key in path:
            result = current.get(key, default, as_of=as_of)
            if result is default or not isinstance(result, Directory):
                raise KeyError(f"could not walk through {key!r}")
            current = result
        return current

    def delete(self, key, /, *, bundler=None, comment=None):
        """ Removes a value from the mapping, returning the muid address of the change.

            If bundler is specified, then simply adds an entry to that bundler.
            If no bundler is specified, then creates one just for this entry,
            sets it's comment to the comment arg (if set) then adds it to the database.
        """
        dir, key = (self.walk(key[:-1]), key[-1]) if isinstance(key, (tuple, list)) else (self, key)
        return dir._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)

    def setdefault(self, key, default=None, /, *, bundler=None, respect_deletion=False):
        """ Insert key with a value of default if key is not in the directory.

            Return the value for key if key is in the directory, else default.

            If respect_deletion is set to something truthy then it won't make any changes
            if the most recent entry in the directory for the key is a delete entry. In this
            case it will return whatever has been passed into respect_deletion.
        """
        dir, key = (self.walk(key[:-1]), key[-1]) if isinstance(key, (tuple, list)) else (self, key)
        as_of = generate_timestamp()
        store = self._database.get_store()
        found = store.get_entry_by_key(dir.get_muid(), key=key, as_of=as_of)
        if found and found.builder.deletion and respect_deletion:  # type: ignore
            return respect_deletion
        if found and not found.builder.deletion:  # type: ignore
            return dir._get_occupant(found.builder, found.address)
        dir._add_entry(key=key, value=default, bundler=bundler)
        return default

    def pop(self, key, *default, bundler=None, comment=None):
        """ If key exists in the mapping, returns the corresponding value and removes it.

            Otherwise returns default.  In the case that the key is found and removed,
            then the change is added to the bundler (or comitted immedately with comment
            if no bundler is specified.)
        """
        dir, key = (self.walk(key[:-1]), key[-1]) if isinstance(key, (tuple, list)) else (self, key)
        as_of = generate_timestamp()
        found = self._database.get_store().get_entry_by_key(dir.get_muid(), key=key, as_of=as_of)
        if found is None or found.builder.deletion:  # type: ignore
            if len(default) >= 1:
                return default[0]
            else:
                raise KeyError(f"could not pop {key}")
        dir._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)
        return dir._get_occupant(found.builder, found.address)

    def items(self, *, as_of=None):
        """ returns an iterable of key,value pairs, as of the effective time (or now) """
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=DIRECTORY)
        for entry_pair in iterable:
            if entry_pair.builder.deletion:  # type: ignore
                continue
            key = decode_key(entry_pair.builder)
            contained = self._get_occupant(entry_pair.builder, entry_pair.address)
            yield (key, contained)

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=DIRECTORY)
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
        as_of = generate_timestamp()
        store = self._database.get_store()
        iterable = store.get_keyed_entries(container=self._muid, as_of=as_of, behavior=DIRECTORY)
        for entry_pair in iterable:
            if entry_pair.builder.deletion:  # type: ignore
                continue
            val = self._get_occupant(entry_pair.builder, entry_pair.address)
            key = decode_key(entry_pair.builder)
            self._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)
            return (key, val)
        raise KeyError("directory is empty")

    def update(self, from_what, /, *, bundler=None, comment=None):
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
            self._database.bundle(bundler)

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
            result[key] = self._database.get_attribution(
                medallion=found.address.medallion, timestamp=found.address.timestamp)
        return result

    def show_blame(self, as_of: GenericTimestamp = None, file=stdout):
        """ dumps the blame map to <file> in a human-readable format """
        for key, val in self.blame(as_of=as_of).items():
            print(repr(key), str(val), file=file)

    def log(self, key: UserKey, /) -> Iterable[Attribution]:
        """ Get the history of modifications for a particular key. """
        as_of = generate_timestamp()
        while as_of:
            found = self._database.get_store().get_entry_by_key(self._muid, key=key, as_of=as_of)
            if not found:
                break
            yield self._database.get_attribution(*found.address)
            as_of = found.address.timestamp

    def show_log(self, key: UserKey, /, *, file=stdout, limit=10):
        """ writes the history of modifications to <file> in a human-readable format """
        for att in self.log(key):
            if limit is not None and limit <= 0:
                break
            print(str(att), file=file)
            if isinstance(limit, int):
                limit -= 1

Database.register_container_type(Directory)
