""" contains the Directory class definition """
from typing import Union, Optional, Iterable, Dict, Iterable, Tuple, Callable, Any, cast
from typeguard import typechecked
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
from .timing import *


class Directory[K: UserKey, V: UserValue|Container](Container):
    """ the Gink mutable mapping object """
    _missing = object()
    _BEHAVIOR = DIRECTORY

    def __init__(
            self,
            *,
            muid: Optional[Union[Muid, str]] = None,
            root: bool = False,
            contents: Optional[Dict[K, V]] = None,
            database: Optional[Database] = None,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None,
    ):
        """
        Constructor for a directory proxy.

        muid: the global id of this container, created on the fly if None
        root: whether this will be the global version of this container (accessible by all databases)
        contents: prefill the directory with a dict of key: value pairs upon initialization
        database: database send bundles through, or last db instance created if None
        bundler: the bundler to add changes to, or a new one if None and immediately commits
        comment: optional comment to add to the bundler
        """
        self._logger = getLogger(self.__class__.__name__)
        database = database or Database.get_most_recently_created_database()
        immediate = False
        bundler = bundler or Bundler.get_active()
        if bundler is None and (contents is not None or (muid is None and not root)):
            immediate = True
            bundler = database.bundler(comment)
        created = False
        if root:
            assert muid is None
            muid = Muid(-1, -1, DIRECTORY)
        elif isinstance(muid, str):
            muid = Muid.from_str(muid)
        elif muid is None:
            assert isinstance(bundler, Bundler), "bundler must be a Bundler instance"
            muid = Container._create(DIRECTORY, bundler=bundler)
            created = True
        assert isinstance(muid, Muid), f"muid must be a Muid, got {type(muid)}"
        Container.__init__(self, muid=muid, database=database)
        if contents:
            if not created:
                self.clear(bundler=bundler)
            self.update(contents, bundler=bundler)
        if immediate and bundler is not None:
            if len(bundler):
                bundler.commit()
            else:
                bundler.rollback()

    def __repr__(self):
        if self._muid.timestamp == -1 and self._muid.medallion == -1:
            return "Directory(root=True)"
        return f"{self.__class__.__name__}(muid={self._muid!r})"


    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ Dumps the contents of this directory to a string.
        """
        if self._muid.medallion == -1 and self._muid.timestamp == -1:
            identifier = "root=True"
        else:
            identifier = f"muid={self._muid!r}"
        result = f"""{self.__class__.__name__}({identifier}, contents="""
        result += "{"
        stuffing = [f"{key!r}: {val!r}" for key, val in self.items(as_of=as_of)]
        as_one_line = result + ", ".join(stuffing) + "})"
        if len(as_one_line) < 80:
            return as_one_line
        result += "\n\t"
        result += ",\n\t".join(stuffing) + "})"
        return result

    def __contains__(self, key: K) -> bool:
        return self.has(key)

    def __getitem__(self, key_or_keys: Union[K, Iterable[K]]) -> V:
        result = self.get(key_or_keys, self._missing)
        if result == self._missing:
            raise KeyError(key_or_keys)
        return cast(V, result)

    def __setitem__(self, key_or_keys: Union[K, Iterable[K]], value: V):
        there_now = self.get(key_or_keys, self._missing)
        if type(value) == type(there_now) and value == there_now:
            return  # this is to prevent in-place operators like += from re-assigning
        self.set(key_or_keys, value)

    def __delitem__(self, key: K):
        self.delete(key)

    def has(self, key_or_keys: Union[K, Iterable[K]], *, as_of=None) -> bool:
        """ returns true if the given key exists in the mapping, optionally at specific time """
        # there's probably a more efficient way of doing this
        obj = object()
        result = self.get(key_or_keys, obj, as_of=as_of)
        return result is not obj

    def get[D](
        self,
        key_or_keys: Union[K, Iterable[K]],
        default: D|None=None, /, *,
        as_of: GenericTimestamp = None,
        ) -> D|V|None:
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
            assert isinstance(key, (str, bytes, int)), f"key must be a string, bytes, or int, got {type(key)}"
            if key == "" or key == b"":
                continue
            if not isinstance(current, Directory):
                raise KeyError(f"cannot traverse item of type: {type(current)}")
            found = store.get_entry_by_key(current._muid, key=key, as_of=resolved)
            if found is None or found.builder.deletion:  # type: ignore
                return default
            current = current._get_occupant(found.builder, found.address)
        return cast(V, current)

    def set(
        self,
        key_or_keys: Union[K, Iterable[K]],
        value: V, /, *,
        bundler: Optional[Bundler] = None,
        comment: Optional[str] = None,
    ) -> Muid:
        """ Sets a value in the mapping, returns the muid address of the entry.

            If bundler is specified, then simply adds an entry to that bundler.
            If no bundler is specified, then creates one just for this entry,
            sets it's comment to the comment arg (if set) then adds it to the database.

            If the first argument is a list or tuple, then it will walk into the relevant
            sub-directory(ies) and set the value there, ignoring empty strings/byte-strings.

        """
        timestamp = generate_timestamp()
        if isinstance(key_or_keys, (tuple, list)):
            keys = [key for key in key_or_keys if key not in ('', b'')]
        else:
            keys = [key_or_keys]
        if len(keys) < 1:
            raise ValueError(f"invalid argument to set: {key_or_keys!r}")
        final_key = keys.pop()
        if not isinstance(final_key, (str, bytes, int)):
            raise AssertionError(f"key must be a string, bytes, or int, got {type(final_key)}")
        current = self
        just_created = False
        store = self._database.get_store()
        bundler = bundler or Bundler.get_active()
        immediate = bundler is None
        if bundler is None:
            bundler = self._database.bundler(comment)
        for key in keys:
            if not isinstance(key, (str, bytes, int)):
                raise TypeError(f"key must be a string, bytes, or int, got {type(key)}")
            found = store.get_entry_by_key(current._muid, key=key, as_of=timestamp) if not just_created else None
            if found is None or found.builder.deletion:  # type: ignore
                new_directory: Directory = Directory(database=self._database, bundler=bundler)
                # if creating this directory is included in the bundler, its muid will still be deferred
                # and calling get_entry_by_key will throw an Exception
                current._add_entry(key=key, value=new_directory, bundler=bundler)
                current = new_directory
                just_created = True
            else:
                occupant = current._get_occupant(found.builder, found.address)
                if isinstance(occupant, Directory):
                    current = occupant
                    just_created = False
                else:
                    raise ValueError(f"cannot set in a non directory: {type(current)}")
        muid = current._add_entry(key=final_key, value=value, bundler=bundler)
        if immediate:
            bundler.commit()
        return muid

    def walk(self, path: Iterable[K], /, *, as_of: GenericTimestamp = None) -> 'Directory':
        """ Walks through the directory structure to find the directory at the end of the path.
            Raises a KeyError if it can't find the directory at the end of the path.
        """
        default = object()
        current: Directory = self
        for key in path:
            result = current.get(key, default, as_of=as_of)
            if result is default or not isinstance(result, Directory):
                raise KeyError(f"could not walk through {key!r}")
            current = result
        return current

    def delete(self, key_or_keys: Union[K, Iterable[K]], /, *,
               bundler: Optional[Bundler] = None, comment: Optional[str] = None):
        """ Removes a value from the mapping, returning the muid address of the change.

            If bundler is specified, then simply adds an entry to that bundler.
            If no bundler is specified, then creates one just for this entry,
            sets it's comment to the comment arg (if set) then adds it to the database.
        """
        if isinstance(key_or_keys, (tuple, list)):
            dir, key = (self.walk(key_or_keys[:-1]), key_or_keys[-1])
        else:
            dir, key = (self, key_or_keys)
        assert isinstance(key, (str, bytes, int)), f"key must be a string, bytes, or int, got {type(key)}"
        return dir._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)

    def setdefault(
        self,
        key: K,
        default: Optional[V]=None, /, *,
        bundler: Optional[Bundler] = None,
        comment: Optional[str] = None,
        default_factory: Optional[Callable[[], V]] = None,
        ) -> V:
        """ Insert key with a value of default if key is not in the directory.

            Return the value for key if key is in the directory, else if default_factory is not None,
            call it and set to the returned value, but if it is None just use the "default".

        """
        if (default is not None and default_factory is not None) or (default is None and default_factory is None):
            raise ValueError("must specify exactly one of default or default_factory")
        dir, key = (self.walk(key[:-1]), key[-1]) if isinstance(key, (tuple, list)) else (self, key)  # type: ignore
        as_of = generate_timestamp()
        store = self._database.get_store()
        found = store.get_entry_by_key(dir.get_muid(), key=key, as_of=as_of)
        if found and not found.builder.deletion:  # type: ignore
            return cast(V, dir._get_occupant(found.builder, found.address))
        value = cast(V, default if default_factory is None else default_factory())
        dir._add_entry(key=key, value=value, bundler=bundler, comment=comment)
        return value

    def pop(self, key: K, *default, bundler: Optional[Bundler] = None, comment: Optional[str] = None) -> V:
        """ If key exists in the mapping, returns the corresponding value and removes it.

            Otherwise returns default.  In the case that the key is found and removed,
            then the change is added to the bundler (or comitted immedately with comment
            if no bundler is specified.)
        """
        dir, key = (self.walk(key[:-1]), key[-1]) if isinstance(key, (tuple, list)) else (self, key)  # type: ignore
        as_of = generate_timestamp()
        found = self._database.get_store().get_entry_by_key(dir.get_muid(), key=key, as_of=as_of)
        if found is None or found.builder.deletion:  # type: ignore
            if len(default) >= 1:
                return default[0]
            else:
                raise KeyError(f"could not pop {key}")  # type: ignore
        dir._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)
        return cast(V, dir._get_occupant(found.builder, found.address))

    def items(self, *, as_of=None) -> Iterable[Tuple[K, V]]:
        """ returns an iterable of key,value pairs, as of the effective time (or now) """
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=DIRECTORY)
        for entry_pair in iterable:
            if entry_pair.builder.deletion:  # type: ignore
                continue
            key = decode_key(entry_pair.builder)
            assert key is not None, "decoded key is None?"
            contained = self._get_occupant(entry_pair.builder, entry_pair.address)
            yield cast(Tuple[K, V], (key, contained))

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

    def keys(self, *, as_of: GenericTimestamp = None) -> Iterable[K]:
        """ returns an iterable of all the keys in this directory """
        for k, _ in self.items(as_of=as_of):
            yield cast(K, k)

    def values(self, *, as_of: GenericTimestamp = None) -> Iterable[V]:
        """ returns a list of values in the directory as of the given time """
        for _, val in self.items(as_of=as_of):
            yield cast(V, val)

    def popitem(
            self, *,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None
    ) -> Tuple[K, V]:
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
            assert key is not None, "decoded key is None?"
            self._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)
            return (cast(K, key), cast(V, val))
        raise KeyError("directory is empty")

    def update(self, from_what: Union[Dict[K, V],
                                Iterable[Tuple[K, V]]],
                                /, *, bundler: Optional[Bundler] = None, comment: Optional[str] = None):
        """ Performs a shallow copy of key/value pairs from the argument.

            When from_what hasattr "keys", then will try: for k in E: D[k] = E[k]
            otherwise will try:  for k, v in E: D[k] = v

        """
        bundler = bundler or Bundler.get_active()
        immediate = False
        if bundler is None:
            immediate = True
            bundler = self._database.bundler(comment)
        if hasattr(from_what, "keys"):
            for key in from_what:
                self._add_entry(key=key, value=from_what[key], bundler=bundler) # type: ignore
        else:
            for key, val in from_what:  # type: ignore
                self._add_entry(key=key, value=val, bundler=bundler)
        if immediate:
            bundler.commit()

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
            muid = found.address
            assert muid.timestamp is not None and muid.medallion is not None
            result[key] = self._database.get_one_attribution(
                medallion=muid.medallion, timestamp=muid.timestamp)
        return result

    def show_blame(self, as_of: GenericTimestamp = None, file=stdout):
        """ dumps the blame map to <file> in a human-readable format """
        for key, val in self.blame(as_of=as_of).items():
            print(repr(key), str(val), file=file)

    def get_attributions(self, key: UserKey, /) -> Iterable[Attribution]:
        """ Get the history of modifications for a particular key. """
        as_of = generate_timestamp()
        while as_of:
            found = self._database.get_store().get_entry_by_key(self._muid, key=key, as_of=as_of)
            if not found:
                break
            muid = found.address
            assert muid.timestamp is not None and muid.medallion is not None
            yield self._database.get_one_attribution(muid.timestamp, muid.medallion)
            as_of = muid.timestamp

    def show_log(self, key: UserKey, /, *, file=stdout, limit=10):
        """ writes the history of modifications to <file> in a human-readable format """
        for att in self.get_attributions(key):
            if limit is not None and limit <= 0:
                break
            print(str(att), file=file)
            if isinstance(limit, int):
                limit -= 1
