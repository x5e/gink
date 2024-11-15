from typing import Optional, Union, List, Type
from types import TracebackType
from logging import getLogger

from .builders import BundleBuilder, ChangeBuilder, EntryBuilder, ContainerBuilder
from .muid import Muid
from .database import Database
from .bundler import Bundler
from .utilities import generate_timestamp, combine
from .decomposition import Decomposition
from .typedefs import MuTimestamp, Medallion

class BoundBundler(Bundler):

    def __init__(
            self,
            database: Optional[Database] = None,
            symmetric_key: Optional[bytes] = None,
            comment: Optional[str] = None,
        ):
        self._symmetric_key = symmetric_key
        self._database = database
        self._decomposition: Optional[Decomposition] = None
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
        if self._decomposition:
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
            assert exc_value is not None and traceback is not None
            self._logger.exception("abandoning bundle: ", exc_info=(exc_type, exc_value, traceback))
        return None

    def commit(self):
        if self._decomposition:
            raise ValueError("already committed")
        assert self._database is not None, "cannot commit without a database"
        with self._database as needed:
            last_link, signing_key = needed
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
                signing_key=signing_key,
                changes=self._changes,
                comment=self._comment,
            )
            wrap = Decomposition(bundle_bytes)
            added = self._database.receive(wrap)
            assert added
            self._decomposition = wrap
            info = wrap.get_info()
            self._logger.debug("locally committed bundle: %r", info)

    def get_decomposition(self) -> Optional[Decomposition]:
        return self._decomposition

    @property
    def timestamp(self) -> Optional[MuTimestamp]:
        return self._decomposition.get_info().timestamp if self._decomposition else None

    @property
    def medallion(self) -> Optional[Medallion]:
        return self._decomposition.get_info().medallion if self._decomposition else None
