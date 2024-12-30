""" contains the Directory class definition """
from typing import Union, Optional, Iterable, Dict, Iterable, Tuple
from typeguard import typechecked
from sys import stdout
from logging import getLogger
from decimal import Decimal

# gink implementation
from .muid import Muid
from .database import Database
from .container import Container
from .coding import ACCUMULATOR, VERTEX
from .bundler import Bundler
from .typedefs import UserKey, GenericTimestamp, UserValue
from .attribution import Attribution
from .utilities import generate_timestamp
from .graph import Vertex

class Accumulator(Container):
    """ the Gink mutable mapping object """

    @typechecked
    def __init__(
            self,
            muid: Optional[Union[Muid, str]] = None,
            *,
            arche: Optional[bool] = None,
            contents: Optional[Dict[Muid, Decimal]] = None,
            database: Optional[Database] = None,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None,
    ):
        database = database or Database.get_most_recently_created_database()
        immediate = False
        if bundler is None:
            immediate = True
            bundler = database.start_bundle(comment)
        created = False
        if arche:
            assert muid is None
            muid = Muid(-1, -1, ACCUMULATOR)
        elif isinstance(muid, str):
            muid = Muid.from_str(muid)
        elif muid is None:
            muid = Container._create(ACCUMULATOR, bundler=bundler)
            created = True
        Container.__init__(self, behavior=ACCUMULATOR, muid=muid, database=database)
        if contents:
            if not created:
                self.clear(bundler=bundler)
            self.update(contents, bundler=bundler)
        if immediate and len(bundler):
            bundler.commit()

    def increment(
            self,
            change: Union[Decimal, int, float] = 1, /, *,
            vertex: Optional[Vertex] = None,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None) -> Muid:
        """ Adds the change to the current value. """
        immediate = False
        if bundler is None:
            immediate = True
            bundler = self._database.start_bundle(comment)
        billionths = int(change * int(1e9))
        key = None if vertex is not None else vertex.get_muid()
        result = self._add_entry(key=key, value=billionths, bundler=bundler)
        if immediate:
            bundler.commit()
        return result

    def get(self, /, *, as_of: GenericTimestamp = None, vertex: Optional[Vertex] = None) -> Decimal:
        vertex_muid = Muid(-1, -1, VERTEX) if vertex is None else vertex.get_muid()
        resolved = -1 if as_of is None else self._database.resolve_timestamp(as_of)
        billionths = self._database.get_store().get_sum(self._muid, vertex_muid, resolved)
        return Decimal(billionths) / int(1e9)
