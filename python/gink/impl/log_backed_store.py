""" implementation of the LogBackedStore class """
from typing import Optional, Union, Callable
from fcntl import flock, LOCK_EX, LOCK_NB, LOCK_UN, LOCK_SH
from pathlib import Path
from .builders import LogFileBuilder, ClaimBuilder
from .memory_store import MemoryStore
from .bundle_wrapper import BundleWrapper
from .abstract_store import Lock
from .tuples import Chain
from .utilities import create_claim


class LogBackedStore(MemoryStore):
    """A Store backed by a simple append-only file."""

    def __init__(self, filepath: Union[Path, str], *, exclusive=False, reset=False):
        MemoryStore.__init__(self)
        self._filepath = Path(filepath)
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
        self.refresh()

    def _acquire_lock(self) -> bool:
        flocked_by_acquire = False
        if not self._flocked:
            flock(self._handle, LOCK_SH)
            flocked_by_acquire = self._flocked = True
        return flocked_by_acquire

    def _release_lock(self, flocked_by_acquire: bool, /):
        if flocked_by_acquire:
            assert self._flocked
            flock(self._handle, LOCK_UN)
            self._flocked = False

    def _add_claim(self, _: Lock, chain: Chain, /):
        assert self._flocked
        claim_builder = super()._add_claim(True, chain)
        self._log_file_builder.Clear()
        self._log_file_builder.claims.append(claim_builder)
        data: bytes = self._log_file_builder.SerializeToString()  # type: ignore
        self._handle.write(data)
        self._handle.flush()

    def _get_file_path(self) -> Optional[Path]:
        return self._filepath

    def _refresh_helper(self, _: Lock, callback: Optional[Callable[[BundleWrapper], None]]=None, /) -> int:
        file_bytes = self._handle.read()
        self._log_file_builder.ParseFromString(file_bytes)  # type: ignore
        count = 0
        for bundle_bytes in self._log_file_builder.bundles:  # type: ignore # pylint: disable=maybe-no-member
            MemoryStore.apply_bundle(self, bundle_bytes, callback=callback)
            count += 1
        for claim_builder in self._log_file_builder.claims:
            self._claims[claim_builder.medallion] = claim_builder
        self._processed_to += len(file_bytes)
        return count

    def apply_bundle(
            self,
            bundle: Union[BundleWrapper, bytes],
            callback: Optional[Callable[[BundleWrapper], None]]=None,
            claim_chain: bool=False,
            ) -> bool:
        if self._handle.closed:
            raise AssertionError("attempt to write to closed LogBackStore")
        if isinstance(bundle, bytes):
            bundle = BundleWrapper(bundle)
        flocked_by_apply = False
        if not self._flocked:
            flock(self._handle, LOCK_EX)  # this will block (wait) if another process has a lock
            flocked_by_apply = self._flocked = True
        self._refresh_helper(True, callback)
        added = MemoryStore.apply_bundle(self, bundle)
        if added:
            self._log_file_builder.Clear()  # type: ignore
            self._log_file_builder.bundles.append(bundle.get_bytes())  # type: ignore
            if claim_chain:
                claim_builder: ClaimBuilder = create_claim(bundle.get_info().get_chain())
                self._log_file_builder.claims.append(claim_builder)
                self._claims[bundle.get_info().medallion] = claim_builder
            data: bytes = self._log_file_builder.SerializeToString()  # type: ignore
            self._handle.write(data)
            self._handle.flush()
            if callback is not None:
                callback(bundle)
        if flocked_by_apply:
            flock(self._handle, LOCK_UN)
            self._flocked = False
        self._clear_notifications()
        return added

    def close(self):
        """Closes the underlying file."""
        self._handle.close()
