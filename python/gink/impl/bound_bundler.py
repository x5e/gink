from typing import Optional, Union, List
from logging import getLogger

from .builders import BundleBuilder, ChangeBuilder, EntryBuilder, ContainerBuilder
from .muid import Muid
from .database import Database
from .bundler import Bundler
from .utilities import generate_timestamp, combine
from .decomposition import Decomposition
from .typedefs import MuTimestamp, Medallion
from .timing import *

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
        self._is_open = True
        self._logger = getLogger(self.__class__.__name__)

    def __len__(self):
        return self._count_items

    def add_change(self, builder: Union[ChangeBuilder, EntryBuilder, ContainerBuilder]) -> Muid:
        """ adds a single change (in the form of the proto builder) """
        # TODO: remove medallion from references when they're within the current chain
        if not self._is_open:
            raise AssertionError("bundle not open")
        self._count_items += 1
        muid = Muid(offset=self._count_items, bundler=self)
        if isinstance(builder, EntryBuilder):
            if muid.offset == 1 and not builder.container.timestamp:
                raise ValueError("attempting to add an entry to an undefined container")
            entry_builder = builder
            builder = ChangeBuilder()
            builder.entry.CopyFrom(entry_builder)  # type: ignore # pylint: disable=maybe-no-member
        assert isinstance(builder, ChangeBuilder)
        self._changes.append(builder)
        return muid

    def is_open(self) -> bool:
        return self._is_open

    def rollback(self):
        self._is_open = False

    def commit(self, _skip_if_empty=True):
        if not self._is_open:
            raise ValueError("bundle isn't open")
        if _skip_if_empty and not self._changes:
            self._logger.info("no changes to commit, skipping")
            return
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

    def get_decomposition(self) -> Optional[Decomposition]:
        return self._decomposition

    @property
    def timestamp(self) -> Optional[MuTimestamp]:
        return self._decomposition.get_info().timestamp if self._decomposition else None

    @property
    def medallion(self) -> Optional[Medallion]:
        return self._decomposition.get_info().medallion if self._decomposition else None
