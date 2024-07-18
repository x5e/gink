""" Contains the pair map class definition """

from typing import Optional, Tuple, Union, Dict, Iterable
from typeguard import typechecked
from .database import Database
from .muid import Muid
from .container import Container
from .coding import PAIR_MAP, deletion, decode_entry_occupant
from .bundler import Bundler
from .typedefs import GenericTimestamp, UserValue
from .utilities import normalize_pair

Pair = Tuple[Union[Container, Muid], Union[Container, Muid]]

class PairMap(Container):
    _missing = object()
    BEHAVIOR = PAIR_MAP

    @typechecked
    def __init__(
            self,
            muid: Optional[Union[Muid, str]] = None,
            *,
            arche: Optional[bool] = None,
            contents: Optional[Dict[Pair, Union[UserValue, Container]]] = None,
            database: Optional[Database] = None,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None,
    ):
        """
        Constructor for a pair map proxy.

        muid: the global id of this container, created on the fly if None
        arche: whether this will be the global version of this container (accessible by all databases)
        contents: prefill the pair map with a dict of (Vertex, Vertex): Value pairs upon initialization
        database: database send bundles through, or last db instance created if None
        bundler: the bundler to add changes to, or a new one if None and immediately commits
        comment: optional comment to add to the bundler
        """
        # if muid and muid.timestamp > 0 and contents:
        # TODO [P3] check the store to make sure that the container is defined and compatible

        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)

        Container.__init__(
                self,
                behavior=PAIR_MAP,
                muid=muid,
                arche=arche,
                database=database,
                bundler=bundler,
            )
        if contents:
            self.clear(bundler=bundler)
            for key_pair, value in contents.items():
                self.set(key_pair, value, bundler)
        if immediate and len(bundler):
            self._database.bundle(bundler)

    @typechecked
    def set(self, key: Pair,
            value: Union[UserValue, Container],
            bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        return self._add_entry(key=key, value=value, bundler=bundler, comment=comment)

    @typechecked
    def get(self, key: Pair,
            default=None, *, as_of: GenericTimestamp = None):
        as_of = self._database.resolve_timestamp(as_of)
        key = normalize_pair(key)
        found = self._database.get_store().get_entry_by_key(self._muid, key=key, as_of=as_of)

        if found is None or found.builder.deletion:  # type: ignore
            return default
        return self._get_occupant(found.builder, found.address)

    @typechecked
    def delete(self, key: Pair,
               bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        return self._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)

    @typechecked
    def has(self, key: Pair, *, as_of=None):
        """ returns true if the given key exists in the mapping, optionally at specific time """
        as_of = self._database.resolve_timestamp(as_of)
        key = normalize_pair(key)
        found = self._database.get_store().get_entry_by_key(self._muid, key=key, as_of=as_of)
        return found is not None and not found.builder.deletion  # type: ignore

    @typechecked
    def items(self, *, as_of=None) -> Iterable[Tuple[Tuple[Muid, Muid], Union[UserValue, Container]]]:
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

    @typechecked
    def __contains__(self, key: Pair):
        return self.has(key)

    @typechecked
    def __getitem__(self, key: Pair):
        result = self.get(key, default=self._missing)
        if result == self._missing:
            raise KeyError(key)
        return result

    @typechecked
    def __setitem__(self, key: Pair, value: Union[UserValue, Container]):
        self.set(key, value)

    @typechecked
    def __delitem__(self, key: Pair):
        self.delete(key)

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ return the contents of this container as a string """
        as_of = self._database.resolve_timestamp(as_of)
        if self._muid.medallion == -1 and self._muid.timestamp == -1:
            identifier = "arche=True"
        else:
            identifier = f"muid={self._muid!r}"
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
                {value if not isinstance(value, bytes) else value!r},"""

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
