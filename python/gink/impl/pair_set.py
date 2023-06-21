""" Contains the pair set class definition """

from typing import Optional, Iterable, Container as StandardContainer, Set, Tuple

from python.gink.impl.database import Database
from python.gink.impl.muid import Muid

from .database import Database
from .muid import Muid
from .container import Container
from .coding import PAIR_SET, deletion, decode_key, inclusion
from .bundler import Bundler
from .graph import Noun
from .typedefs import GenericTimestamp, UserKey
from .builders import Behavior

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
