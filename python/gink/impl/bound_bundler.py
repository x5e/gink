from typing import Optional, Union, Any, List, Type
from types import TracebackType
from nacl.signing import SigningKey
from nacl.secret import SecretBox
from logging import getLogger

from .builders import BundleBuilder, ChangeBuilder, EntryBuilder, ContainerBuilder
from .typedefs import MuTimestamp, Medallion
from .tuples import Chain
from .muid import Muid
from .database import Database
from .bundler import Bundler, BundleInfo
from .utilities import generate_timestamp
from .bundle_wrapper import BundleWrapper

class BoundBundler(Bundler):

    def __init__(
            self,
            database: Database,
            symmetric_key: Optional[bytes] = None,
            signing_key: Optional[SigningKey] = None,
            comment: Optional[str] = None,
        ):
        self._symmetric_key = symmetric_key
        self._signing_key = signing_key
        self._database = database
        self._sealed: Optional[bytes] = None
        self._bundle_builder = BundleBuilder()
        self._count_items = 0
        self._comment = comment
        self._changes: List[ChangeBuilder] = []
        self._logger = getLogger(self.__class__.__name__)

    def __str__(self):
        return str(self._bundle_builder)

    def __len__(self):
        return self._count_items

    def add_change(self, builder: Union[ChangeBuilder, EntryBuilder, ContainerBuilder]) -> Muid:
        """ adds a single change (in the form of the proto builder) """
        # TODO: remove medallion from references when they're within the current chain
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

    def __exit__(
        self, /,
        exc_type: Optional[Type[BaseException]],
        exc_value: Optional[BaseException],
        traceback: Optional[TracebackType]
    ) -> Optional[bool]:
        if exc_type is None:
            self.commit()
        else:
            self._logger.exception("bundler abandoning bundle: ", exc_info=(exc_type, exc_value, traceback))

    def commit(self) -> BundleInfo:
        assert not self._sealed, "already committed"
        with self._database:
            last_link = self.get_last_link()
            chain = last_link.get_chain()
            seen_to = last_link.timestamp
            assert seen_to is not None
            timestamp = generate_timestamp()
            assert timestamp > seen_to
            signing_key = self._database.get_signing_key()
            assert signing_key is not None
            assert self._last_link.hex_hash is not None
            bundle_bytes = self._seal(
                chain=chain,
                timestamp=timestamp,
                previous=seen_to,
                signing_key=self._signing_key,
                prior_hash=self._last_link.hex_hash,
            )
            wrap = BundleWrapper(bundle_bytes)
            added = self.receive(wrap)
            assert added
            info = wrap.get_info()
            self._logger.debug("locally committed bundle: %r", info)
            return info

    def _seal(
            self, *,
            chain: Chain,
            identity: Optional[str] = None,
            timestamp: MuTimestamp,
            signing_key: SigningKey,
            previous: Optional[MuTimestamp] = None,
            prior_hash: Union[bytes, str, None] = None,
            ) -> bytes:
        """ Finalizes a bundle and serializes it.
            Identity is required if this is the first bundle in a chain.
        """
        # pylint: disable=maybe-no-member
        if previous is None:
            assert timestamp == chain.chain_start
            assert identity is not None, "Identity is required for first bundle in a chain."
            self._bundle_builder.identity = identity
            self._bundle_builder.verify_key = signing_key.verify_key.encode()
        else:
            assert chain.chain_start <= previous < timestamp
            assert identity is None, "Identity is only used in first bundle in a chain."
            self._bundle_builder.previous = previous  # type: ignore
        self._bundle_builder.chain_start = chain.chain_start  # type: ignore
        self._bundle_builder.medallion = chain.medallion  # type: ignore
        self._bundle_builder.timestamp = timestamp  # type: ignore
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
