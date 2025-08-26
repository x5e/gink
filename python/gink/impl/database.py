#!/usr/bin/env python3
""" contains the Database class """

# standard python modules
from typing import Optional, Union, Iterable, List, Tuple
from sys import stdout
from logging import getLogger
from re import fullmatch
from nacl.signing import SigningKey, VerifyKey
from dateutil.parser import parse
from pathlib import Path

# gink modules
from .abstract_store import AbstractStore
from .bundler import Bundler
from .bundle_info import BundleInfo
from .typedefs import Medallion, MuTimestamp, GenericTimestamp, EPOCH
from .tuples import Chain
from .attribution import Attribution
from .decomposition import Decomposition
from .muid import Muid
from threading import Lock
from .utilities import (
    generate_timestamp,
    get_identity,
    generate_medallion,
    resolve_timestamp,
    combine,
    experimental,
    summarize,
)
from .relay import Relay
from .timing import *


class Database(Relay):
    """ A class that mediates user interaction with a datastore and peers. """
    _chain: Optional[Chain]
    _last_time: Optional[MuTimestamp]
    _abstract_store: AbstractStore
    _last_link: Optional[BundleInfo]
    _signing_key: Optional[SigningKey]
    _lock: Lock
    _symmetric_key: Optional[bytes]

    def __init__(
            self,
            store: Union[AbstractStore, str, Path, None] = None,
            identity: str = get_identity(),
            allow_new_chains: bool = True,
            require_symmetric_key: bool = False,
            ):
        super().__init__(store=store)
        setattr(Database, "_last", self)
        assert isinstance(self._store, AbstractStore), "store must be an AbstractStore"
        self._abstract_store = self._store
        self._last_link = None
        self._last_time = None
        self._identity = identity
        self._logger = getLogger(self.__class__.__name__)
        self._lock = Lock()
        self._signing_key = None
        self._symmetric_key = None
        self._allow_new_chains = allow_new_chains
        self._require_symmetric_key = require_symmetric_key

    def get_root(self):
        from .directory import Directory
        return Directory(root=True, database=self)

    def __enter__(self) -> Tuple[BundleInfo, SigningKey]:
        """ This is called by the bound bundler, and not intended for general use. """
        self._lock.acquire()
        bundle_info, signing_key = self._acquire_appendable_link()
        assert isinstance(bundle_info, BundleInfo), "not a bundle info?"
        assert isinstance(signing_key, SigningKey), "not a signing key?"
        return bundle_info, signing_key

    def __exit__(self, *_):
        self._lock.release()

    def ge(self) -> AbstractStore:
        """ returns the store managed by this database """
        return self._abstract_store

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
                return int(parse(timestamp).timestamp() * 1_000_000)
        if isinstance(timestamp, int) and -1e6 < timestamp < 1e6:
            bundle_info = self._abstract_store.get_one(BundleInfo, int(timestamp))
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

    def get_store(self) -> AbstractStore:
        """ Returns the store managed by this database """
        return self._abstract_store

    def _acquire_appendable_link(self) -> Tuple[BundleInfo, SigningKey]:
        """ Sets up the internal structures to allow the database to add additional data.

            Either starts a chain or finds one to reuse, then returns the last link in it.
        """
        if self._last_link is not None:
            assert self._signing_key is not None
            return self._last_link, self._signing_key
        assert self._signing_key is None
        assert self._symmetric_key is None
        to_reuse = self._abstract_store.maybe_reuse_chain(self._identity)
        if to_reuse:
            # TODO: lookup symmetric key based on chain
            symmetric_key = self._abstract_store.get_symmetric_key(None)
            if self._require_symmetric_key and symmetric_key is None:
                raise RuntimeError("symmetric key required, but none found for reused chain")
            self._symmetric_key = symmetric_key
            verify_key = self._abstract_store.get_verify_key(to_reuse.get_chain())
            assert isinstance(verify_key, VerifyKey)
            self._signing_key = self._abstract_store.get_signing_key(verify_key)
            assert isinstance(self._signing_key, SigningKey)
            if self._signing_key is None:
                raise AssertionError("could not find a signing key")
            self._last_link = to_reuse
            return to_reuse, self._signing_key
        elif not self._allow_new_chains:
            raise RuntimeError("no existing chain to reuse, and new chains are not allowed")
        symmetric_key = self._abstract_store.get_symmetric_key(None)
        if self._require_symmetric_key and symmetric_key is None:
            raise RuntimeError("symmetric key required, but no default key found")
        self._symmetric_key = symmetric_key
        self._signing_key = SigningKey.generate()
        self._abstract_store.save_signing_key(self._signing_key)
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
        self._abstract_store.apply_bundle(wrapper, self._on_bundle, claim_chain=True)
        self._last_link = wrapper.get_info()
        return self._last_link, self._signing_key

    def bundler(self, comment: Optional[str] = None) -> Bundler:
        from .bound_bundler import BoundBundler
        symmetric_key = self._abstract_store.get_symmetric_key(None)
        bundler = BoundBundler(database=self, comment=comment, symmetric_key=symmetric_key)
        return bundler

    def reset(self, to_time: GenericTimestamp = EPOCH, *, bundler=None, comment=None) -> None:
        """ Resets the database to a specific point in time.

            Note that it literally just "re"-sets everything in one big
            bundle to the values that existed at that time, so you can always
            go and look at the state of the database beforehand.
        """
        immediate = False
        if bundler is None:
            immediate = True
            bundler = self.bundler(comment)
        assert isinstance(bundler, Bundler)
        to_time = self.resolve_timestamp(to_time)
        for change in self._abstract_store.get_reset_changes(to_time=to_time, container=None, user_key=None):
            bundler.add_change(change)
        if immediate:
            bundler.commit()

    def dump(self, *,
             include_empty_containers=False,
             as_of: GenericTimestamp = None,
             file=stdout,
             ):
        """ writes the contents of the database to file """
        from .container import Container
        from .get_container import get_container, container_classes
        file.write("\n")
        for cls in container_classes.values():
            container = cls(muid=Muid(-1,-1,cls.get_behavior()), database=self)
            assert isinstance(container, Container)
            if include_empty_containers or container.size(as_of=as_of):
                container.dump(as_of=as_of, file=file)
        for muid, container_builder in self._abstract_store.list_containers():
            container = get_container(muid=muid, behavior=container_builder.behavior, database=self)
            if include_empty_containers or container.size(as_of=as_of):
                container.dump(as_of=as_of, file=file)

    def get_one_attribution(self, timestamp: MuTimestamp, medallion: Medallion, *_) -> Attribution:
        """ Takes a timestamp and medallion and figures out who/what to blame the changes on.

            After the timestamp and medallion it will ignore other ordered arguments, so
            that it can be used via get_attribution(*muid).
        """
        comment = self._abstract_store.get_comment(medallion=medallion, timestamp=timestamp) or None
        if comment is None:
            decomposition = self._abstract_store.get_one_bundle(timestamp=timestamp, medallion=medallion)
            comment = summarize(decomposition) if decomposition else None
        chain = self._abstract_store.find_chain(medallion=medallion, timestamp=timestamp)
        identity = self._abstract_store.get_identity(chain)
        return Attribution(
            timestamp=timestamp,
            medallion=medallion,
            identity=identity,
            abstract=comment,
        )

    def get_attributions(self, limit: Optional[int] = None, *, include_empty=False) -> Iterable[Attribution]:
        """ Gets a list of attributions representing all bundles stored by the db. """
        for bundle_info in self._abstract_store.get_some(BundleInfo, limit):
            assert isinstance(bundle_info, BundleInfo)
            attribution = self.get_one_attribution(bundle_info.timestamp, bundle_info.medallion)
            if not include_empty and attribution.abstract is None or attribution.abstract == "<empty bundle>":
                continue
            yield attribution

    def show_log(self, frmt=None, /, limit: Optional[int] = None, include_starts=False, file=stdout):
        """ Just prints the log to stdout in a human-readable format. """
        for attribution in self.get_attributions(limit=limit, include_empty=include_starts):
            print(format(attribution, frmt) if frmt else attribution, file=file)

    @experimental
    def get_by_name(self, name: str, as_of: GenericTimestamp = None) -> List:
        """ Returns all containers of the given type with the given name.
        """
        from .get_container import get_container
        returning = list()
        as_of_ts = self.resolve_timestamp(as_of)
        for address, builder in self._abstract_store.get_by_name(name, as_of=as_of_ts):
            container = get_container(muid=address, behavior=builder.behavior, database=self)
            returning.append(container)
        return returning
