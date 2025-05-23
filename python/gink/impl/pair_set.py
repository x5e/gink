""" Contains the pair set class definition """

from typing import Optional, Tuple, Iterable, Union, Set
from typeguard import typechecked
from .database import Database
from .muid import Muid
from .container import Container
from .coding import PAIR_SET, deletion, inclusion
from .bundler import Bundler
from .typedefs import GenericTimestamp
from .utilities import normalize_pair, experimental

Pair = Tuple[Union[Container, Muid], Union[Container, Muid]]

@experimental
class PairSet(Container):
    _missing = object()
    _BEHAVIOR = PAIR_SET

    @typechecked
    def __init__(
                self,
                *,
                muid: Optional[Union[Muid, str]] = None,
                contents: Optional[Iterable[Pair]] = None,
                database: Optional[Database] = None,
                bundler: Optional[Bundler] = None,
                comment: Optional[str] = None,
            ):
        """
        Constructor for a pair set proxy.

        muid: the global id of this container, created on the fly if None
        contents: optionally expecting a dictionary of {"include": Set, "exclude": Set} to prefill the pair set
        database: database send bundles through, or last db instance created if None
        bundler: the bundler to add changes to, or a new one if None and immediately commits
        comment: optional comment to add to the bundler
        """
        database = database or Database.get_most_recently_created_database()
        immediate = False
        if bundler is None:
            immediate = True
            bundler = database.bundler(comment)
        created = False
        if isinstance(muid, str):
            muid = Muid.from_str(muid)
        elif muid is None:
            muid = Container._create(PAIR_SET, bundler=bundler)
            created = True
        Container.__init__(self, muid=muid, database=database)
        if contents:
            assert isinstance(contents, dict)
            assert contents.keys() <= {"include", "exclude"}, "expecting only 'include' and 'exclude' keys in contents"
            if not created:
                self.clear(bundler=bundler)
            included = contents.get("include", set())
            assert isinstance(included, Iterable)
            for pair in included:
                assert isinstance(pair, tuple) and len(pair) == 2
                self.include(pair, bundler=bundler) # type: ignore

            excluded = contents.get("exclude", set())
            assert isinstance(excluded, Iterable)
            for pair in excluded:
                assert isinstance(pair, tuple) and len(pair) == 2
                self.exclude(pair, bundler=bundler) # type: ignore

        if immediate and len(bundler):
            bundler.commit()

    @typechecked
    def include(self, pair: Pair, *, bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Includes a pair of Containers or Muids in the pair set """
        return self._add_entry(key=pair, value=inclusion, bundler=bundler, comment=comment)

    @typechecked
    def exclude(self, pair: Pair, *, bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Excludes a pair of Containers or Muids from the pair set """
        return self._add_entry(key=pair, value=deletion, bundler=bundler, comment=comment)

    @typechecked
    def contains(self, pair: Pair, *, as_of: GenericTimestamp = None) -> bool:
        """ Returns True if the pair is included the pair set """
        ts = self._database.resolve_timestamp(as_of)
        pair = normalize_pair(pair)
        found = self._database.get_store().get_entry_by_key(self.get_muid(), key=pair, as_of=ts)
        return bool(found and not found.builder.deletion)

    @typechecked
    def __contains__(self, pair: Pair) -> bool:
        return self.contains(pair)

    def get_pairs(self, *, as_of: GenericTimestamp = None) -> Set[Tuple[Muid, Muid]]:
        """ Returns a set of muid pairs included in the pair set at a given time """
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=self._BEHAVIOR)

        return {(Muid.create(builder=entry_pair.builder.pair.left, context=entry_pair.address),
                Muid.create(builder=entry_pair.builder.pair.rite, context=entry_pair.address))
                for entry_pair in iterable if not entry_pair.builder.deletion}

    def __iter__(self) -> Iterable[Tuple[Muid, Muid]]:
        for pair in self.get_pairs():
            yield pair

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        """ Returns the number of elements included in the pair set, optionally at a given time """
        ts = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=ts, behavior=self._BEHAVIOR)
        count = 0
        for entry_pair in iterable:
            if not entry_pair.builder.deletion:
                count += 1
        return count

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ Returns the contents of this container as a string """
        as_of = self._database.resolve_timestamp(as_of)
        identifier = f"muid={self._muid!r}"
        result = f"""{self.__class__.__name__}({identifier}, contents="""
        result += "{"

        included_stuffing = "'include': [\n\t"
        excluded_stuffing = "'exclude': [\n\t"
        something = False
        for entry_pair in self._database.get_store().get_keyed_entries(
            container=self.get_muid(), behavior=self._BEHAVIOR, as_of=as_of):
            something = True
            left = Muid.create(builder=entry_pair.builder.pair.left)
            rite = Muid.create(builder=entry_pair.builder.pair.rite)
            if entry_pair.builder.deletion:
                excluded_stuffing += f"({left!r}, {rite!r}),\n\t"
            else:
                included_stuffing += f"({left!r}, {rite!r}),\n\t"

        if something:
            result += "\n\t"
        if included_stuffing != "'include': [\n\t":
            result += "".join(included_stuffing) + "],"
        if excluded_stuffing != "'exclude': [\n\t":
            result += "".join(excluded_stuffing) + "],"

        result += "})"
        return result
