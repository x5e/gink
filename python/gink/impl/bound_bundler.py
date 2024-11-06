from typing import Optional, Union, List, Type
from types import TracebackType
from nacl.signing import SigningKey
from logging import getLogger

from .builders import BundleBuilder, ChangeBuilder, EntryBuilder, ContainerBuilder
from .muid import Muid
from .database import Database
from .bundler import Bundler
from .utilities import generate_timestamp, combine
from .bundle_wrapper import BundleWrapper

class BoundBundler(Bundler):

    def __init__(
            self,
            database: Optional[Database] = None,
            symmetric_key: Optional[bytes] = None,
            signing_key: Optional[SigningKey] = None,
            comment: Optional[str] = None,
        ):
        self._symmetric_key = symmetric_key
        self._signing_key = signing_key
        self._database = database
        self._bundle_wrapper: Optional[BundleWrapper] = None
        self._bundle_builder = BundleBuilder()
        self._count_items = 0
        self._comment = comment
        self._changes: List[ChangeBuilder] = []
        self._logger = getLogger(self.__class__.__name__)

    def __len__(self):
        return self._count_items

    def add_change(self, builder: Union[ChangeBuilder, EntryBuilder, ContainerBuilder]) -> Muid:
        """ adds a single change (in the form of the proto builder) """
        # TODO: remove medallion from references when they're within the current chain
        if self._bundle_wrapper:
            raise AssertionError("already completed")
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

    def commit(self):
        if self._bundle_wrapper:
            raise ValueError("already committed")
        assert self._database is not None, "cannot commit without a database"
        with self._database:
            last_link = self._database.get_last_link(force=True)
            chain = last_link.get_chain()
            seen_to = last_link.timestamp
            assert seen_to is not None
            timestamp = generate_timestamp()
            assert timestamp > seen_to
            assert last_link.hex_hash is not None
            bundle_bytes = combine(
                chain=chain,
                timestamp=timestamp,
                previous=seen_to,
                prior_hash=last_link.hex_hash,
                signing_key=self._signing_key,
                changes=self._changes,
            )
            wrap = BundleWrapper(bundle_bytes)
            added = self._database.receive(wrap)
            assert added
            self._bundle_wrapper = wrap
            info = wrap.get_info()
            self._logger.debug("locally committed bundle: %r", info)

    def get_wrap(self) -> Optional[BundleWrapper]:
        return self._bundle_wrapper
