""" Contains the pair set class definition """

from typing import Optional, Tuple, Iterable, Union, Set, Dict
from .database import Database
from .muid import Muid
from .container import Container
from .coding import PAIR_SET, deletion, inclusion
from .bundler import Bundler
from .graph import Vertex
from .typedefs import GenericTimestamp

class PairSet(Container):
    _missing = object()
    BEHAVIOR = PAIR_SET

    def __init__(
                self,
                muid: Optional[Union[Muid, str]] = None,
                *,
                contents: Optional[Dict[str, Iterable[Union[Tuple[Vertex, Vertex], Tuple[Muid, Muid]]]]] = None,
                database: Optional[Database] = None,
                bundler: Optional[Bundler] = None,
                comment: Optional[str] = None,
            ):
        """
        Constructor for a pair set proxy.

        muid: the global id of this container, created on the fly if None
        arche: whether this will be the global version of this container (accessible by all databases)
        contents: prefill the pair set with an iterable of (Vertex, Vertex) upon initialization
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
                behavior=PAIR_SET,
                muid=muid,
                arche=False,
                database=database,
                bundler=bundler,
            )
        if contents:
            assert isinstance(contents, dict), "expecting contents to be of the form {'included': Iterable[(Muid, Muid)], 'excluded': Iterable[(Muid, Muid)]}"
            self.clear(bundler=bundler)
            included = contents.get("included", set())
            assert isinstance(included, Iterable)
            for pair in included:
                assert isinstance(pair, tuple) and len(pair) == 2
                self.include(pair, bundler=bundler)

            excluded = contents.get("excluded", set())
            assert isinstance(excluded, Iterable)
            for pair in excluded:
                assert isinstance(pair, tuple) and len(pair) == 2
                self.exclude(pair, bundler=bundler)

        if immediate and len(bundler):
            self._database.bundle(bundler)

    def include(self, pair: Union[Tuple[Vertex, Vertex], Tuple[Muid, Muid]], *,
                bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Includes a pair of Vertexs in the pair set """
        return self._add_entry(key=pair, value=inclusion, bundler=bundler, comment=comment)

    def exclude(self, pair: Union[Tuple[Vertex, Vertex], Tuple[Muid, Muid]], *,
                bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Excludes a pair of Vertexs from the pair set """
        return self._add_entry(key=pair, value=deletion, bundler=bundler, comment=comment)

    def contains(self, pair: Union[Tuple[Vertex, Vertex], Tuple[Muid, Muid]], *, as_of: GenericTimestamp = None) -> bool:
        ts = self._database.resolve_timestamp(as_of)
        assert len(pair) == 2
        if isinstance(pair[0], Vertex):
            muid_pair = (pair[0]._muid, pair[1]._muid)
            found = self._database.get_store().get_entry_by_key(self.get_muid(), key=muid_pair, as_of=ts)
        else:
            found = self._database.get_store().get_entry_by_key(self.get_muid(), key=pair, as_of=ts)
        return bool(found and not found.builder.deletion)

    def __contains__(self, pair: Union[Tuple[Vertex, Vertex], Tuple[Muid, Muid]]) -> bool:
        return self.contains(pair)

    def get_pairs(self, *, as_of: GenericTimestamp = None) -> Set[Tuple[Muid, Muid]]:
        """ Returns a set of muid pairs in the pair set at a given time """
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=self.BEHAVIOR)

        return {(Muid.create(builder=entry_pair.builder.pair.left, context=entry_pair.address),
                Muid.create(builder=entry_pair.builder.pair.rite, context=entry_pair.address))
                for entry_pair in iterable if not entry_pair.builder.deletion}

    def __iter__(self) -> Iterable[Tuple[Muid, Muid]]:
        for pair in self.get_pairs():
            yield pair

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        """ returns the number of elements contained """
        ts = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=ts, behavior=self.BEHAVIOR)
        count = 0
        for entry_pair in iterable:
            if not entry_pair.builder.deletion:
                count += 1
        return count

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ return the contents of this container as a string """
        as_of = self._database.resolve_timestamp(as_of)
        identifier = f"muid={self._muid!r}"
        result = f"""{self.__class__.__name__}({identifier}, contents="""
        result += "{"

        included_stuffing = "'included': [\n\t"
        excluded_stuffing = "'excluded': [\n\t"
        for entry_pair in self._database.get_store().get_keyed_entries(container=self.get_muid(), behavior=self.BEHAVIOR, as_of=as_of):
            left = entry_pair.builder.pair.left
            rite = entry_pair.builder.pair.rite
            if not entry_pair.builder.deletion:
                included_stuffing += f"(Muid{(left.timestamp, left.medallion, left.offset)}, Muid{(rite.timestamp, rite.medallion, rite.offset)}),\n\t"
            else:
                excluded_stuffing += f"(Muid{(left.timestamp, left.medallion, left.offset)}, Muid{(rite.timestamp, rite.medallion, rite.offset)}),\n\t"

        result += "\n\t"
        if included_stuffing != "'included': [\n\t":
            result += "".join(included_stuffing) + "],"
        if excluded_stuffing != "'excluded': [\n\t":
            result += "".join(excluded_stuffing) + "],"

        result += "})"
        return result

Database.register_container_type(PairSet)
