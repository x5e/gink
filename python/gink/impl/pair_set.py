""" Contains the pair set class definition """

from typing import Optional, Tuple, Iterable, Union, Set
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

    def __init__(self, arche: Optional[bool] = None, bundler: Optional[Bundler] = None,
                 contents: Union[Iterable[Tuple[Vertex, Vertex]], None] = None,
                 muid: Optional[Muid] = None, database = None, comment: Optional[str] = None):
        """
        Constructor for a pair set proxy.

        muid: the global id of this pair set, created on the fly if None
        contents: an iterable of pairs (an iterable of tuples) to populate the pair set at initialization
        db: database to send bundles through, or last db instance created if None
        """
        if arche:
            muid = Muid(-1, -1, PAIR_SET)
        database = database or Database.get_last()
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)
        if muid is None:
            muid = Container._create(PAIR_SET, database=database, bundler=bundler)
        elif muid.timestamp > 0 and contents:
            # TODO [P3] check the store to make sure that the container is defined and compatible
            pass
        Container.__init__(self, muid=muid, database=database)
        if contents:
            self.clear(bundler=bundler)
            for item in contents:
                assert isinstance(item, tuple) and len(item) == 2
                self.include(item, bundler=bundler)

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
        identifier = repr(str(self._muid))
        result = f"""{self.__class__.__name__}({identifier}, contents="""
        result += "["
        stuffing = ""
        for entry_pair in self._database.get_store().get_keyed_entries(container=self.get_muid(), behavior=self.BEHAVIOR, as_of=as_of):
            if not entry_pair.builder.deletion:
                left = entry_pair.builder.pair.left
                rite = entry_pair.builder.pair.rite
                stuffing += f"(Muid{(left.timestamp, left.medallion, left.offset)}, Muid{(rite.timestamp, rite.medallion, rite.offset)}),\n\t"
        as_one_line = result + ",".join(stuffing) + "])"
        if len(as_one_line) < 80:
            return as_one_line
        result += "\n\t"
        result += "".join(stuffing) + "])"
        return result

Database.register_container_type(PairSet)
