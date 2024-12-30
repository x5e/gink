""" contains the Directory class definition """
from typing import Union, Optional
from typeguard import typechecked
from decimal import Decimal

# gink implementation
from .muid import Muid
from .database import Database
from .container import Container
from .coding import ACCUMULATOR
from .bundler import Bundler
from .typedefs import GenericTimestamp
from .addressable import Addressable


class Accumulator(Container):
    """ the Gink mutable mapping object """

    @typechecked
    def __init__(
            self,
            muid: Optional[Union[Muid, str]] = None,
            *,
            arche: Optional[bool] = None,
            contents: Union[Decimal, int, float, None] = None,
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
            self.increment(contents, bundler=bundler)
        if immediate and len(bundler):
            bundler.commit()

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        if self._muid == Muid(-1, -1, ACCUMULATOR):
            id = "arche=True"
        else:
            id = repr(self._muid)
        return f"{self.__class__.__name__}({id}, contents={self.get(as_of=as_of)!r})"

    def increment(
            self,
            change: Union[Decimal, int, float] = 1, /, *,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None) -> Muid:
        """ Adds the change to the current value. """
        immediate = False
        if bundler is None:
            immediate = True
            bundler = self._database.start_bundle(comment)
        billionths = int(change * int(1e9))
        result = self._add_entry(value=billionths, bundler=bundler)
        if immediate:
            bundler.commit()
        return result

    def clear(self, bundler: Optional[Bundler] = None, comment: Optional[str] = None) -> Muid:
        """ Subtracts the current value. """
        return self.increment(-1 * self.get(), bundler=bundler, comment=comment)

    def get(self, /, *, as_of: GenericTimestamp = None) -> Decimal:
        """ Returns the effective value as of the given time (or as of right now). """
        resolved = -1 if as_of is None else self._database.resolve_timestamp(as_of)
        billionths = self._database.get_store().get_billionths(self._muid, resolved)
        return Decimal(billionths) / int(1e9)

    def __iadd__(self, value: Union[Decimal, int, float], /):
        self.increment(+1 * value)

    def __isub__(self, value: Union[Decimal, int, float], /):
        self.increment(-1 * value)

    def __eq__(self, other):
        if isinstance(other, (int, float, Decimal)):
            return Decimal(other) == self.get()
        if isinstance(other, Addressable):
            return other.get_muid() == self._muid
        return False

    def __ne__(self, value):
        return not self.__eq__(value)
