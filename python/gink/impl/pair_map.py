""" Contains the pair map class definition """

from typing import Optional, Tuple, Union, Iterable
from .database import Database
from .muid import Muid
from .container import Container
from .coding import PAIR_MAP, deletion, decode_entry_occupant
from .bundler import Bundler
from .graph import Vertex
from .typedefs import GenericTimestamp, UserValue

class PairMap(Container):
    _missing = object()
    BEHAVIOR = PAIR_MAP

    def __init__(self, arche: Optional[bool] = None, bundler: Optional[Bundler] = None,
                 contents: Optional[dict] = None, muid: Optional[Muid] = None,
                 database = None, comment: Optional[str] = None):
        """
        Constructor for a pair set proxy.

        contents: dictionary of (Vertex, Vertex): Value to populate the pair map
        muid: the global id of this pair set, created on the fly if None
        db: database to send bundles through, or last db instance created if None
        """
        if arche:
            muid = Muid(-1, -1, PAIR_MAP)
        database = database or Database.get_last()
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)
        if muid is None:
            muid = Container._create(PAIR_MAP, database=database, bundler=bundler)
        elif muid.timestamp > 0 and contents:
            # TODO [P3] check the store to make sure that the container is defined and compatible
            pass
        Container.__init__(self, muid=muid, database=database)
        if contents:
            self.clear(bundler=bundler)
            for key_pair, value in contents.items():
                self.set(key_pair, value, bundler)
        if immediate and len(bundler):
            self._database.bundle(bundler)

    def set(self, key: Union[Tuple[Vertex, Vertex], Tuple[Muid, Muid]],
            value: Union[UserValue, Container],
            bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        return self._add_entry(key=key, value=value, bundler=bundler, comment=comment)

    def get(self, key: Union[Tuple[Vertex, Vertex], Tuple[Muid, Muid]],
            default=None, *, as_of: GenericTimestamp = None):
        as_of = self._database.resolve_timestamp(as_of)
        if isinstance(key[0], Vertex) and isinstance(key[1], Vertex):
            muid_key = (key[0]._muid, key[1]._muid)
            found = self._database.get_store().get_entry_by_key(self._muid, key=muid_key, as_of=as_of)
        elif isinstance(key[0], Muid) and isinstance(key[1], Muid):
            found = self._database.get_store().get_entry_by_key(self._muid, key=key, as_of=as_of)
        else:
            raise ValueError(f"Not sure what to do with {key}, not a tuple of muids or vertices.")

        if found is None or found.builder.deletion:  # type: ignore
            return default
        return self._get_occupant(found.builder, found.address)

    def delete(self, key: Tuple[Vertex, Vertex],
               bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        return self._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)

    def has(self, key: Union[Tuple[Vertex, Vertex], Tuple[Muid, Muid]], *, as_of=None):
        """ returns true if the given key exists in the mapping, optionally at specific time """
        as_of = self._database.resolve_timestamp(as_of)
        assert isinstance(key, tuple)
        if isinstance(key[0], Container) and isinstance(key[1], Container):
            pair_muid = (key[0]._muid, key[1]._muid)
        else:
            pair_muid = key
        found = self._database.get_store().get_entry_by_key(self._muid, key=pair_muid, as_of=as_of)
        return found is not None and not found.builder.deletion  # type: ignore

    def items(self, *, as_of=None):
        """ returns an iterable of key,value pairs, as of the effective time (or now) """
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(container=self._muid, as_of=as_of, behavior=PAIR_MAP)
        for entry_pair in iterable:
            if entry_pair.builder.deletion:  # type: ignore
                continue
            left = entry_pair.builder.pair.left
            rite = entry_pair.builder.pair.rite
            key = (Muid(left.timestamp, left.medallion, left.offset),
                    (Muid(rite.timestamp, rite.medallion, rite.offset)))
            contained = self._get_occupant(entry_pair.builder, entry_pair.address)
            yield key, contained

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

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ return the contents of this container as a string """
        as_of = self._database.resolve_timestamp(as_of)
        if self._muid.medallion == -1 and self._muid.timestamp == -1:
            identifier = "arche=True"
        else:
            identifier = repr(str(self._muid))
        result = f"""{self.__class__.__name__}({identifier}, contents="""
        result += "{"
        stuffing = ""
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=PAIR_MAP)
        for entry_pair in iterable:
            left = entry_pair.builder.pair.left
            rite = entry_pair.builder.pair.rite
            if not entry_pair.builder.deletion:
                value = decode_entry_occupant(self._muid, entry_pair.builder)
                stuffing += f"""\n\t(Muid{(left.timestamp, left.medallion, left.offset)},
                Muid{(rite.timestamp, rite.medallion, rite.offset)}):
                "{value if not isinstance(value, bytes) else value!r}","""

        as_one_line = result + ", ".join(stuffing) + "})"
        if len(as_one_line) < 80:
            return as_one_line
        result += "\n\t"
        result += "".join(stuffing) + "})"
        return result

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        """ returns the number of elements contained """
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=PAIR_MAP)
        count = 0
        for entry_pair in iterable:
            if entry_pair.builder.deletion:
                continue
            count += 1
        return count

Database.register_container_type(PairMap)
