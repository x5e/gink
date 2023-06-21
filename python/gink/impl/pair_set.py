""" Contains the pair set class definition """

from typing import Optional, Tuple
from .database import Database
from .muid import Muid
from .container import Container
from .coding import PAIR_SET, deletion
from .bundler import Bundler
from .graph import Noun
from .builders import Behavior
from .typedefs import GenericTimestamp

class PairSet(Container):
    _missing = object()
    BEHAVIOR = PAIR_SET

    def __init__(self, root: Optional[bool] = None, bundler: Optional[Bundler] = None, contents = None,
                 muid: Optional[Muid] = None, database = None, comment: Optional[str] = None):
        """
        Constructor for a pair set proxy.

        muid: the global id of this pair set, created on the fly if None
        db: database to send commits through, or last db instance created if None
        """
        if root:
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
        if immediate and len(bundler):
            self._database.commit(bundler)

    def include(self, pair: Tuple[Noun, Noun], *, bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Includes a pair of Nouns in the pair set """
        return self._add_pair_entry(pair=pair, bundler=bundler, comment=comment)

    def exclude(self, pair: Tuple[Noun, Noun], *, bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Excludes a pair of Nouns from the pair set """
        pass

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        """ returns the number of elements contained """
        ts = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=ts, behavior=Behavior.PAIR_SET)
        count = 0
        for entry_pair in iterable:
            if not entry_pair.builder.deletion:
                count += 1
        return count

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ return the contents of this container as a string """
        pass
