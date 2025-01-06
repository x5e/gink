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
    _BEHAVIOR = ACCUMULATOR

    @typechecked
    def __init__(
            self,
            *,
            muid: Optional[Union[Muid, str]] = None,
            contents: Union[Decimal, int, float, None] = None,
            database: Optional[Database] = None,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None,
    ):
        database = database or Database.get_most_recently_created_database()
        bundler = bundler or database.get_open_bundler()
        immediate = False
        if bundler is None:
            immediate = True
            bundler = database.start_bundle(comment)
        created = False
        if isinstance(muid, str):
            muid = Muid.from_str(muid)
        elif muid is None:
            muid = Container._create(ACCUMULATOR, bundler=bundler)
            created = True
        assert isinstance(muid, Muid)
        assert muid.timestamp != -1 or muid.offset == ACCUMULATOR
        Container.__init__(self, muid=muid, database=database)
        if contents:
            if not created:
                self.clear(bundler=bundler)
            self.increment(contents, bundler=bundler)
        if immediate and len(bundler):
            bundler.commit()

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        id = repr(self._muid)
        return f"{self.__class__.__name__}({id}, contents={self.get(as_of=as_of)!r})"

    def increment(
            self,
            change: Union[Decimal, int, float] = 1, /, *,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None) -> Muid:
        """ Adds the change to the current value. """
        billionths = int(change * int(1e9))
        return self._add_entry(value=billionths, bundler=bundler, comment=comment)

    def clear(self, bundler: Optional[Bundler] = None, comment: Optional[str] = None) -> Muid:
        """ Subtracts the current value. """
        # Note that just setting the value to zero rather than subtracting the current
        # value would lead to some edge cases where the accumulator won't converge
        # to the same value across instances in case of a network partition.
        return self.increment(-1 * self.get(), bundler=bundler, comment=comment)

    def get(self, /, *, as_of: GenericTimestamp = None) -> Decimal:
        """ Returns the effective value as of the given time (or as of right now). """
        billionths = self.size(as_of=as_of)
        return Decimal(billionths) / int(1e9)

    def __iadd__(self, value: Union[Decimal, int, float], /):
        self.increment(+1 * value)
        return self

    def __isub__(self, value: Union[Decimal, int, float], /):
        self.increment(-1 * value)
        return self

    def __eq__(self, other):
        if isinstance(other, (int, float, Decimal)):
            my_value = self.get()
            other_decimal = Decimal(str(other)) if isinstance(other, float) else other
            return other_decimal == my_value
        if isinstance(other, Addressable):
            return other.get_muid() == self._muid
        return False

    def __ne__(self, value):
        return not self.__eq__(value)

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        """ Returns the number of billionths. """
        resolved = -1 if as_of is None else self._database.resolve_timestamp(as_of)
        return self._database.get_store().get_billionths(self._muid, as_of=resolved)

    def __int__(self) -> int:
        return int(self.get())

    def __float__(self) -> float:
        return float(self.get())

    def __str__(self) -> str:
        return str(self.get())
