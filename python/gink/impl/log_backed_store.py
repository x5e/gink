""" implementation of the LogBackedStore class """
from typing import Optional, Union, Dict
from fcntl import flock, LOCK_EX, LOCK_NB, LOCK_UN, LOCK_SH
from .builders import LogFileBuilder, ClaimBuilder
from .memory_store import MemoryStore
from .bundle_wrapper import BundleWrapper
from .abstract_store import BundleCallback, Mapping
from .typedefs import Medallion


class LogBackedStore(MemoryStore):
    """A Store backed by a simple append-only file."""

    def __init__(self, filepath, *, exclusive=False, reset=False):
        MemoryStore.__init__(self)
        self._filepath = filepath
        self._handle = open(self._filepath, "ab+")
        self._flocked: bool = False
        self._exclusive = bool(exclusive)
        if self._exclusive:
            flock(self._handle, LOCK_EX | LOCK_NB)  # this will throw if another process has a lock
            self._flocked = True
        if reset:
            self._handle.truncate()
        self._handle.seek(0)
        self._processed_to = 0
        self._log_file_builder = LogFileBuilder()
        self._claims: Dict[Medallion, ClaimBuilder] = dict()
        self.refresh()

    def refresh(self, callback: Optional[BundleCallback] = None):
        flocked_by_refresh = False
        if not self._flocked:
            flock(self._handle, LOCK_SH)
            self._flocked = True
            flocked_by_refresh = True
        file_bytes = self._handle.read()
        self._log_file_builder.ParseFromString(file_bytes)  # type: ignore
        for bundle_bytes in self._log_file_builder.commits:  # type: ignore # pylint: disable=maybe-no-member
            MemoryStore.apply_bundle(self, bundle_bytes, callback=callback)
        for claim_builder in self._log_file_builder.claims:
            self._claims[claim_builder.medallion] = claim_builder
        self._processed_to += len(file_bytes)
        if flocked_by_refresh:
            flock(self._handle, LOCK_UN)
            self._flocked = False

    def apply_bundle(self, bundle: Union[BundleWrapper, bytes], callback: Optional[BundleCallback]=None) -> bool:
        if self._handle.closed:
            raise AssertionError("attempt to write to closed LogBackStore")
        if isinstance(bundle, bytes):
            bundle = BundleWrapper(bundle)
        flocked_by_apply = False
        if not self._flocked:
            flock(self._handle, LOCK_EX)  # this will block (wait) if another process has a lock
            flocked_by_apply = True
            self._flocked = True
        self.refresh(callback=callback)
        added = MemoryStore.apply_bundle(self, bundle)
        if added:
            self._log_file_builder.Clear()  # type: ignore
            self._log_file_builder.commits.push(bundle_bytes)  # type: ignore
            data: bytes = self._log_file_builder.SerializeToString()  # type: ignore
            self._handle.write(data)
            self._handle.flush()
            if callback is not None:
                callback(bundle.get_bytes(), bundle.get_info())
        if flocked_by_apply:
            flock(self._handle, LOCK_UN)
            self._flocked = False
        return added

    def get_claims(self) -> Mapping[Medallion, ClaimBuilder]:
        return self._claims

    def close(self):
        """Closes the underlying file."""
        self._handle.close()
