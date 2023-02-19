""" the ChangeSet class """
from typing import Optional, Union, Any

from .builders import BundleBuilder, ChangeBuilder, EntryBuilder
from .muid import Muid
from .typedefs import MuTimestamp, Medallion
from .tuples import Chain

class Bundler:
    """ Manages construction and finalization of a change set. """

    def __init__(self, comment: Optional[str]=None):
        self._sealed: Optional[bytes] = None
        self._bundle_builder = BundleBuilder()
        self._count_items = 0
        self._comment = comment
        self._medallion: Optional[Medallion] = None
        self._timestamp: Optional[MuTimestamp] = None

    def __str__(self):
        return str(self._bundle_builder)

    def __len__(self):
        return self._count_items

    def __setattr__(self, __name: str, __value: Any) -> None:
        if hasattr(self, "_sealed") and self._sealed is not None:
            raise AttributeError("can't change a sealed change set")
        if __name == "comment":
            self._comment = __value
            return
        object.__setattr__(self, __name, __value)

    def __getattr__(self, name):
        if name == "medallion":
            return self._medallion
        if name == "timestamp":
            return self._timestamp
        if name == "comment":
            return self._comment
        if name == "sealed":
            return self._sealed
        return object.__getattribute__(self, name)

    def add_change(self, builder: Union[ChangeBuilder, EntryBuilder]) -> Muid:
        """ adds a single change (in the form of the proto builder) """
        if self._sealed:
            raise AssertionError("already sealed")
        self._count_items += 1
        muid = self.Deferred(offset=self._count_items, bundler=self)
        if isinstance(builder, EntryBuilder):
            entry_builder = builder
            builder = ChangeBuilder()
            builder.entry.CopyFrom(entry_builder) # type: ignore # pylint: disable=maybe-no-member
        assert isinstance(builder, ChangeBuilder)
        changes = self._bundle_builder.changes # type: ignore # pylint: disable=maybe-no-member
        changes[self._count_items].CopyFrom(builder) # type: ignore
        return muid

    def seal(self,
        chain: Chain,
        timestamp: MuTimestamp,
        previous: Optional[MuTimestamp]=None
    ) -> bytes:
        """ Finalizes a bundle and serializes it. """
         # pylint: disable=maybe-no-member
        if previous is None:
            assert timestamp == chain.chain_start
        else:
            assert chain.chain_start <= previous < timestamp
            self._bundle_builder.previous = previous # type: ignore
        self._bundle_builder.chain_start = chain.chain_start # type: ignore
        self._medallion = self._bundle_builder.medallion = chain.medallion # type: ignore
        self._timestamp = self._bundle_builder.timestamp = timestamp # type: ignore
        if self._comment:
            self._bundle_builder.comment = self.comment # type: ignore
        sealed = self._bundle_builder.SerializeToString()
        self._sealed = sealed
        return sealed

    class Deferred(Muid):
        """ Version of a muid that references a bundle.

            We need a custom subclass here because we want to return something that can
            be used as a muid, but we don't have the timestamp and medallion set until
            the bundle has been sealed.  This class allows us to return an address object
            that will give "None" when asked for timestamp/medallion before the bundle
            has been sealed, and the appropriate values after sealing.
        """

        def __new__(cls, offset: int, bundler: Any):
            assert bundler is not None
            return super().__new__(cls, 0, 0, offset)

        def __init__(self, offset: int, bundler: Any) -> None:
            assert offset != 0
            super().__init__(0, 0, offset) # type: ignore
            self._bundler = bundler

        def __getattribute__(self, name):
            if name == "_bundler":
                return object.__getattribute__(self, "_bundler")
            if name == "offset":
                return Muid.__getattribute__(self, "offset")
            if name == "timestamp":
                return getattr(self._bundler, "timestamp")
            if name == "medallion":
                return getattr(self._bundler, "medallion")
            if name == "put_into":
                return lambda x: Muid.put_into(self, x)
            raise AttributeError(f"unknown attribute: {name}")

        def __hash__(self):
            return hash((self.offset, self.medallion, self.timestamp))

        def __eq__(self, other):
            if not isinstance(other, Muid):
                return False
            return ( (self.offset, self.medallion, self.timestamp) # type: ignore
                == (other.offset, other.medallion, other.timestamp) ) # type: ignore
