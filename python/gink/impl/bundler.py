""" the ChangeSet class """
from typing import Optional, Union, Any, List
from nacl.signing import SigningKey

from .builders import BundleBuilder, ChangeBuilder, EntryBuilder, ContainerBuilder
from .typedefs import MuTimestamp, Medallion
from .tuples import Chain
from .muid import Muid


class Bundler:
    """ Manages construction and finalization of a change set. """

    def __init__(self, comment: Optional[str] = None):
        self._sealed: Optional[bytes] = None
        self._bundle_builder = BundleBuilder()
        self._count_items = 0
        self._comment = comment
        self._medallion: Optional[Medallion] = None
        self._timestamp: Optional[MuTimestamp] = None
        self._changes: List[ChangeBuilder] = []

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
        muid = Muid(offset=self._count_items, bundler=self)
        if isinstance(builder, EntryBuilder):
            entry_builder = builder
            builder = ChangeBuilder()
            builder.entry.CopyFrom(entry_builder)  # type: ignore # pylint: disable=maybe-no-member
        assert isinstance(builder, ChangeBuilder)
        self._changes.append(builder)
        return muid

    def seal(
            self, *,
            chain: Chain,
            timestamp: MuTimestamp,
            signing_key: SigningKey,
            previous: Optional[MuTimestamp] = None,
            prior_hash: Union[bytes, str, None] = None,
            ) -> bytes:
        """ Finalizes a bundle and serializes it. """
        # pylint: disable=maybe-no-member
        if previous is None:
            assert timestamp == chain.chain_start
            self._bundle_builder.verify_key = signing_key.verify_key.encode()
        else:
            assert chain.chain_start <= previous < timestamp
            self._bundle_builder.previous = previous  # type: ignore
        self._bundle_builder.chain_start = chain.chain_start  # type: ignore
        self._medallion = self._bundle_builder.medallion = chain.medallion  # type: ignore
        self._timestamp = self._bundle_builder.timestamp = timestamp  # type: ignore
        if self._comment:
            self._bundle_builder.comment = self.comment  # type: ignore
        if prior_hash:
            if isinstance(prior_hash, str):
                prior_hash = bytes.fromhex(prior_hash)
            assert isinstance(prior_hash, bytes) and len(prior_hash) == 32
            self._bundle_builder.prior_hash = prior_hash
        self._bundle_builder.changes.extend(self._changes)
        serialized = self._bundle_builder.SerializeToString()
        signed = signing_key.sign(serialized)
        self._sealed = signed
        return signed
