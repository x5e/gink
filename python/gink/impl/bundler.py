""" the ChangeSet class """
from typing import Optional, Union, Any

from ..builders.bundle_pb2 import Bundle as BundleBuilder
from ..builders.change_pb2 import Change as ChangeBuilder
from ..builders.entry_pb2 import Entry as EntryBuilder

from .bundle_info import BundleInfo
from .muid import Muid

class Bundler:
    """ Manages construction and finalization of a change set. """

    def __init__(self, comment: Optional[str]=None):
        self._sealed: Union[bool, bytes] = False
        self._bundle_builder = BundleBuilder()
        self._count_items = 0
        self._comment = comment
        self._info: Optional[BundleInfo] = None

    def __str__(self):
        return str(self._bundle_builder)

    def __len__(self):
        return self._count_items

    def __setattr__(self, __name: str, __value: Any) -> None:
        if hasattr(self, "_sealed") and self._sealed:
            raise AttributeError("can't change a sealed change set")
        if __name == "comment":
            self._comment = __value
            return
        object.__setattr__(self, __name, __value)

    def __getattr__(self, name):
        if name == "medallion":
            return self._info.medallion if self._info else None
        if name == "timestamp":
            return self._info.timestamp if self._info else None
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

    def seal(self, bundle_info: BundleInfo) -> bytes:
        """ Finalizes a bundle and serializes it. """
        self._bundle_builder.chain_start = bundle_info.chain_start # type: ignore # pylint: disable=maybe-no-member
        self._bundle_builder.medallion = bundle_info.medallion # type: ignore # pylint: disable=maybe-no-member
        self._bundle_builder.timestamp = bundle_info.timestamp # type: ignore # pylint: disable=maybe-no-member
        if bundle_info.prior_time:
            self._bundle_builder.previous = bundle_info.prior_time # type: ignore # pylint: disable=maybe-no-member
        if self._comment:
            self._bundle_builder.comment = self.comment # type: ignore # pylint: disable=maybe-no-member
        self._info = bundle_info
        self._sealed = self._bundle_builder.SerializeToString() # type: ignore # pylint: disable=maybe-no-member
        return self._sealed

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
            return Muid.__new__(cls, None, None, offset)

        def __init__(self, offset: int, bundler: Any):
            if not offset:
                Muid.__init__(self, 0, 0, offset)
            assert offset
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
            return hash((self.offset, self.medallion, self.timestamp))  # type: ignore

        def __eq__(self, other):
            if not isinstance(other, Muid):
                return False
            return ( (self.offset, self.medallion, self.timestamp) # type: ignore
                == (other.offset, other.medallion, other.timestamp) ) # type: ignore
