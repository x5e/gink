""" the ChangeSet class """
from __future__ import annotations
from typing import Optional, Union, Any

from .builders import BundleBuilder, ChangeBuilder, EntryBuilder, ContainerBuilder
from .muid import Muid
from .typedefs import MuTimestamp, Medallion
from .tuples import Chain
from .deferred import Deferred


class Bundler:
    """ Manages construction and finalization of a change set. """

    def __init__(self, comment: Optional[str] = None):
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

    def add_change(self, builder: Union[ChangeBuilder, EntryBuilder, ContainerBuilder]) -> Muid:
        """ adds a single change (in the form of the proto builder) """
        if self._sealed:
            raise AssertionError("already sealed")
        self._count_items += 1
        muid = Deferred(offset=self._count_items, bundler=self)
        if isinstance(builder, EntryBuilder):
            entry_builder = builder
            builder = ChangeBuilder()
            builder.entry.CopyFrom(entry_builder)  # type: ignore # pylint: disable=maybe-no-member
        assert isinstance(builder, ChangeBuilder)
        changes = self._bundle_builder.changes  # type: ignore # pylint: disable=maybe-no-member
        changes[self._count_items].CopyFrom(builder)  # type: ignore
        return muid

    def seal(self,
             chain: Chain,
             timestamp: MuTimestamp,
             previous: Optional[MuTimestamp] = None
             ) -> bytes:
        """ Finalizes a bundle and serializes it. """
        # pylint: disable=maybe-no-member
        if previous is None:
            assert timestamp == chain.chain_start
        else:
            assert chain.chain_start <= previous < timestamp
            self._bundle_builder.header.previous = previous  # type: ignore
        self._bundle_builder.header.chain_start = chain.chain_start  # type: ignore
        self._medallion = self._bundle_builder.header.medallion = chain.medallion  # type: ignore
        self._timestamp = self._bundle_builder.header.timestamp = timestamp  # type: ignore
        if self._comment:
            self._bundle_builder.header.comment = self.comment  # type: ignore
        sealed = self._bundle_builder.SerializeToString()
        self._sealed = sealed
        return sealed
