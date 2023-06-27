""" Contains the pair map class definition """

from typing import Optional, Tuple, Union
from .database import Database
from .muid import Muid
from .container import Container
from .coding import PAIR_MAP, deletion
from .bundler import Bundler
from .graph import Noun
from .typedefs import GenericTimestamp, UserValue

class PairMap(Container):
    _missing = object()
    BEHAVIOR = PAIR_MAP

    def __init__(self, root: Optional[bool] = None, bundler: Optional[Bundler] = None, contents = None,
                 muid: Optional[Muid] = None, database = None, comment: Optional[str] = None):
        """
        Constructor for a pair set proxy.

        muid: the global id of this pair set, created on the fly if None
        db: database to send commits through, or last db instance created if None
        """
        if root:
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
        if immediate and len(bundler):
            self._database.commit(bundler)

    def set(self, key: Tuple[Noun, Noun],
            value: Union[UserValue, Container],
            bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        return self._add_entry(key=key, value=value, bundler=bundler, comment=comment)

    def get(self, key: Tuple[Noun, Noun], default=None, *, as_of: GenericTimestamp = None):
        as_of = self._database.resolve_timestamp(as_of)
        found = self._database.get_store().get_entry_by_key(self._muid, key=key, as_of=as_of)
        if found is None or found.builder.deletion:  # type: ignore
            return default
        return self._get_occupant(found.builder, found.address)

    def delete(self, key: Tuple[Noun, Noun],
               bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        return self._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ return the contents of this container as a string """
        as_of = self._database.resolve_timestamp(as_of)
        if self._muid.medallion == -1 and self._muid.timestamp == -1:
            identifier = "root=True"
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
                stuffing += f"""\n\t({Muid(left.timestamp, left.medallion, left.offset)},
                {Muid(rite.timestamp, rite.medallion, rite.offset)}): {entry_pair.builder.value.characters}"""

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
