#!/usr/bin/env python3
""" contains the Database class """

# standard python modules
from typing import Optional, Union, Iterable, List
from sys import stdout
from logging import getLogger
from re import fullmatch

# builders
from .builders import ContainerBuilder

# gink modules
from .abstract_store import AbstractStore
from .bundler import Bundler
from .bundle_info import BundleInfo
from .typedefs import Medallion, MuTimestamp, GenericTimestamp, EPOCH
from .tuples import Chain
from .muid import Muid
from .attribution import Attribution
from .bundle_wrapper import BundleWrapper
from threading import Lock
from .utilities import (
    generate_timestamp,
    experimental,
    get_identity,
    generate_medallion,
    resolve_timestamp,
)
from .relay import Relay


class Database(Relay):
    """ A class that mediates user interaction with a datastore and peers. """
    _chain: Optional[Chain]
    _last_time: Optional[MuTimestamp]
    _store: AbstractStore
    _last_link: Optional[BundleInfo]
    _container_types: dict = {}

    def __init__(self, store: Union[AbstractStore, str, None] = None, identity=get_identity()):
        super().__init__(store=store)
        setattr(Database, "_last", self)
        self._last_link = None
        self._last_time = None
        self._identity = identity
        self._logger = getLogger(self.__class__.__name__)
        self._lock = Lock()

    def get_store(self) -> AbstractStore:
        """ returns the store managed by this database """
        return self._store

    @staticmethod
    def get_last():
        last = getattr(Database, "_last")
        assert isinstance(last, Database)
        return last

    @classmethod
    def register_container_type(cls, container_cls: type):
        assert hasattr(container_cls, "BEHAVIOR")
        behavior = getattr(container_cls, "BEHAVIOR")
        cls._container_types[behavior] = container_cls

    @experimental
    def get_chain(self) -> Optional[Chain]:
        """ gets the chain this database is appending to (or None if it hasn't started writing yet) """
        if self._last_link is not None:
            return self._last_link.get_chain()
        return None

    @experimental
    def get_now(self):
        return generate_timestamp()

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

    def _acquire_appendable_chain(self) -> BundleInfo:
        """ Either starts a chain or finds one to reuse, then returns the last link in it.
        """
        reused = self._store.maybe_reuse_chain(self._identity)
        if reused:
            return reused
        medallion = generate_medallion()
        chain_start = generate_timestamp()
        chain = Chain(medallion=medallion, chain_start=chain_start)
        bundler = Bundler(self._identity)
        bundle_bytes = bundler.seal(chain=chain, timestamp=chain_start)
        wrapper = BundleWrapper(bundle_bytes=bundle_bytes)
        self._store.apply_bundle(wrapper, self._on_bundle, claim_chain=True)
        return wrapper.get_info()

    def bundle(self, bundler: Bundler) -> BundleInfo:
        """ seals bundler and adds the resulting bundle to the local store """
        assert not bundler.sealed
        with self._lock:  # using an exclusive lock to ensure that we don't fork a chain
            if not self._last_link:
                self._last_link = self._acquire_appendable_chain()
            chain = self._last_link.get_chain()
            seen_to = self._last_link.timestamp
            assert seen_to is not None
            timestamp = generate_timestamp()
            assert timestamp > seen_to
            bundle_bytes = bundler.seal(chain=chain, timestamp=timestamp, previous=seen_to)
            wrap = BundleWrapper(bundle_bytes)
            added = self.receive(wrap)
            assert added
            info = wrap.get_info()
            self._last_link = info
            self._logger.debug("locally committed bundle: %r", info)
            return info

    def reset(self, to_time: GenericTimestamp = EPOCH, *, bundler=None, comment=None):
        """ Resets the database to a specific point in time.

            Note that it literally just "re"-sets everything in one big
            bundle to the values that existed at that time, so you can always
            go and look at the state of the database beforehand.
        """
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)
        assert isinstance(bundler, Bundler)
        to_time = self.resolve_timestamp(to_time)
        for change in self._store.get_reset_changes(to_time=to_time, container=None, user_key=None):
            bundler.add_change(change)
        if immediate and len(bundler):
            self.bundle(bundler=bundler)
        return bundler

    def get_container(
            self,
            muid: Muid, *,
            container_builder: Optional[ContainerBuilder] = None,
            behavior: Optional[int] = None,
    ):
        """ Gets a pre-existing container associated with a particular muid """
        if muid.timestamp == -1:
            behavior = muid.offset
        elif behavior is None:
            container_builder = container_builder or self._store.get_container(muid)
            behavior = getattr(container_builder, "behavior")
        cls = self._container_types.get(behavior)
        if not cls:
            raise AssertionError(f"behavior not recognized: {behavior}")
        return cls(muid=muid, database=self)

    def dump(self, *,
             include_global_containers=True,
             as_of: GenericTimestamp = None,
             file=stdout,
             ):
        """ writes the contents of the database to file """
        from .container import Container
        for muid, container_builder in self._store.list_containers():
            container = self.get_container(muid, container_builder=container_builder)
            assert isinstance(container, Container)
            if container.size(as_of=as_of):
                container.dump(as_of=as_of, file=file)
        if include_global_containers:
            for cls in self._container_types.values():
                container = cls.get_global_instance(self)
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
        returning = list()
        as_of_ts = self.resolve_timestamp(as_of)
        for found_container in self._store.get_by_name(name, as_of=as_of_ts):
            returning.append(self.get_container(found_container.address))
        return returning
