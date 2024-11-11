#!/usr/bin/env python3
""" contains the Database class """

# standard python modules
from typing import Optional, Union, Iterable, List, Tuple
from sys import stdout
from logging import getLogger
from re import fullmatch
from nacl.signing import SigningKey

# gink modules
from .abstract_store import AbstractStore
from .bundler import Bundler
from .bundle_info import BundleInfo
from .typedefs import Medallion, MuTimestamp, GenericTimestamp, EPOCH
from .tuples import Chain
from .attribution import Attribution
from .decomposition import Decomposition
from threading import Lock
from .utilities import (
    generate_timestamp,
    get_identity,
    generate_medallion,
    resolve_timestamp,
    combine,
)
from .relay import Relay


class Database(Relay):
    """ A class that mediates user interaction with a datastore and peers. """
    _chain: Optional[Chain]
    _last_time: Optional[MuTimestamp]
    _store: AbstractStore
    _last_link: Optional[BundleInfo]
    _signing_key: Optional[SigningKey]
    _lock: Lock
    _symmetric_key: Optional[bytes]

    def __init__(
            self,
            store: Union[AbstractStore, str, None] = None,
            identity: str = get_identity(),
            ):
        super().__init__(store=store)
        setattr(Database, "_last", self)
        self._last_link = None
        self._last_time = None
        self._identity = identity
        self._logger = getLogger(self.__class__.__name__)
        self._lock = Lock()
        self._signing_key = None
        self._symmetric_key = None

    def __enter__(self) -> Tuple[BundleInfo, SigningKey]:
        self._lock.acquire()
        return self._acquire_appendable_link()

    def __exit__(self, *_):
        self._lock.release()

    def get_store(self) -> AbstractStore:
        """ returns the store managed by this database """
        return self._store

    @staticmethod
    def get_most_recently_created_database():
        """ Gets the last database created """
        last = getattr(Database, "_last")
        assert isinstance(last, Database)
        return last

    def resolve_timestamp(self, timestamp: GenericTimestamp = None) -> MuTimestamp:
        """ translates an abstract time into a real timestamp

            date and datetime behave as you might expect (turned into unix time)

            integers and floats that look like timestamps or microsecond timestamps are
            treated as such.

            small integers are treated as "right before the <index> bundle"
        """
        if timestamp is None:
            return generate_timestamp()
        if isinstance(timestamp, str):
            if fullmatch(r"-?\d+", timestamp):
                timestamp = int(timestamp)
            else:
                timestamp = float(timestamp)
        if isinstance(timestamp, int) and -1e6 < timestamp < 1e6:
            bundle_info = self._store.get_one(BundleInfo, int(timestamp))
            if bundle_info is None:
                raise ValueError("don't have that many bundles")
            assert isinstance(bundle_info, BundleInfo)
            return bundle_info.timestamp
        return resolve_timestamp(timestamp)

    def _on_bundle(self, bundle_wrapper: Decomposition) -> None:
        info = bundle_wrapper.get_info()
        if self._last_link and info.get_chain() == self._last_link.get_chain():
            self._last_link = info
        super()._on_bundle(bundle_wrapper)

    def _acquire_appendable_link(self) -> Tuple[BundleInfo, SigningKey]:
        """ Sets up the internal structures to allow the database to add additional data.

            Either starts a chain or finds one to reuse, then returns the last link in it.
        """
        if self._last_link is not None:
            return self._last_link, self._signing_key
        assert self._signing_key is None
        assert self._symmetric_key is None
        self._last_link = reused = self._store.maybe_reuse_chain(self._identity)
        if reused:
            self._symmetric_key = self._store.get_symmetric_key(reused.get_chain())
            verify_key = self._store.get_verify_key(reused.get_chain())
            self._signing_key = self._store.get_signing_key(verify_key)
            return reused, self._signing_key
        self._signing_key = SigningKey.generate()
        self._store.save_signing_key(self._signing_key)
        self._symmetric_key = self._store.get_symmetric_key(None)
        medallion = generate_medallion()
        chain_start = generate_timestamp()
        chain = Chain(medallion=medallion, chain_start=chain_start)
        bundle_bytes = combine(
            chain=chain,
            identity=self._identity,
            timestamp=chain_start,
            signing_key=self._signing_key,
        )
        wrapper = Decomposition(bundle_bytes=bundle_bytes)
        self._store.apply_bundle(wrapper, self._on_bundle, claim_chain=True)
        self._last_link = wrapper.get_info()
        return self._last_link, self._signing_key

    def start_bundle(self, comment: Optional[str] = None) -> Bundler:
        from .bound_bundler import BoundBundler
        symmetric_key = self._store.get_symmetric_key(None)
        return BoundBundler(database=self, comment=comment, symmetric_key=symmetric_key)

    def reset(self, to_time: GenericTimestamp = EPOCH, *, bundler=None, comment=None) -> None:
        """ Resets the database to a specific point in time.

            Note that it literally just "re"-sets everything in one big
            bundle to the values that existed at that time, so you can always
            go and look at the state of the database beforehand.
        """
        immediate = False
        if bundler is None:
            immediate = True
            bundler = self.start_bundle(comment)
        assert isinstance(bundler, Bundler)
        to_time = self.resolve_timestamp(to_time)
        for change in self._store.get_reset_changes(to_time=to_time, container=None, user_key=None):
            bundler.add_change(change)
        if immediate:
            bundler.commit()

    def dump(self, *,
             include_global_containers=True,
             as_of: GenericTimestamp = None,
             file=stdout,
             ):
        """ writes the contents of the database to file """
        from .container import Container
        from .get_container import get_container, container_classes
        for muid, container_builder in self._store.list_containers():
            container = get_container(muid=muid, behavior=container_builder.behavior, database=self)
            assert isinstance(container, Container)
            if container.size(as_of=as_of):
                container.dump(as_of=as_of, file=file)
        if include_global_containers:
            for cls in container_classes.values():
                container = cls(arche=True, database=self)
                assert isinstance(container, Container)
                if container.size(as_of=as_of):
                    container.dump(as_of=as_of, file=file)

    def get_attribution(self, timestamp: MuTimestamp, medallion: Medallion, *_) -> Attribution:
        """ Takes a timestamp and medallion and figures out who/what to blame the changes on.

            After the timestamp and medallion it will ignore other ordered arguments, so
            that it can be used via get_attribution(*muid).
        """
        comment = self._store.get_comment(medallion=medallion, timestamp=timestamp)
        chain = self._store.find_chain(medallion=medallion, timestamp=timestamp)
        identity = self._store.get_identity(chain)
        return Attribution(
            timestamp=timestamp,
            medallion=medallion,
            identity=identity,
            abstract=comment,
        )

    def log(self, limit: Optional[int] = -10, *, include_starts=False) -> Iterable[Attribution]:
        """ Gets a list of attributions representing all bundles stored by the db. """
        for bundle_info in self._store.get_some(BundleInfo, limit):
            assert isinstance(bundle_info, BundleInfo)
            if bundle_info.timestamp == bundle_info.chain_start and not include_starts:
                continue
            yield self.get_attribution(bundle_info.timestamp, bundle_info.medallion)

    def show_log(self, limit: Optional[int] = -10, *, include_starts=False, file=stdout):
        """ Just prints the log to stdout in a human-readable format. """
        for attribution in self.log(limit=limit, include_starts=include_starts):
            print(attribution, file=file)

    def get_by_name(self, name: str, as_of: GenericTimestamp = None) -> List:
        """ Returns all containers of the given type with the given name.
        """
        from .get_container import get_container
        returning = list()
        as_of_ts = self.resolve_timestamp(as_of)
        for address, builder in self._store.get_by_name(name, as_of=as_of_ts):
            container = get_container(muid=address, behavior=builder.behavior, database=self)
            returning.append(container)
        return returning
