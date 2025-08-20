""" implementation of the LogBackedStore class """
from typing import Optional, Union, Callable
from fcntl import flock, LOCK_EX, LOCK_NB, LOCK_UN, LOCK_SH
from pathlib import Path
from nacl.signing import SigningKey, VerifyKey

from .builders import LogFileBuilder, ClaimBuilder, KeyPairBuilder
from .memory_store import MemoryStore
from .decomposition import Decomposition
from .abstract_store import Lock
from .tuples import Chain
from .utilities import create_claim
from .timing import *


class LogBackedStore(MemoryStore):
    """A Store backed by a simple append-only file."""

    def __init__(self, filepath: Union[Path, str], *, exclusive=False, reset=False):
        MemoryStore.__init__(self)
        self._log_file_builder = LogFileBuilder()
        self._filepath = Path(filepath)
        self._handle = open(self._filepath, "ab+")
        self._is_closed = False
        self._flocked: bool = False
        self._exclusive = bool(exclusive)
        if self._exclusive:
            flock(self._handle, LOCK_EX | LOCK_NB)  # this will throw if another process has a lock
            self._flocked = True
        flocked_by_aquire = self._acquire_lock()
        if reset:
            self._handle.truncate()
        self._processed_to = 0
        self._handle.seek(0, 2)
        file_starting_size = self._handle.tell()
        if file_starting_size == 0:
            self._log_file_builder.magic_number = 1263421767
            data: bytes = self._log_file_builder.SerializeToString()
            self._handle.write(data)
            self._handle.flush()
            self._processed_to += len(data)
        else:
            self._handle.seek(0)
            self._refresh_helper(flocked_by_aquire)
        self._release_lock(flocked_by_aquire)

    def is_closed(self) -> bool:
        """ Return true if closed """
        return self._is_closed

    @staticmethod
    def is_binlog_file(path: Union[str, Path]) -> bool:
        path = Path(path)
        if not path.exists():
            raise Exception(f"{path} does not exist!")
        with path.open("rb") as handle:
            first_bytes = handle.read(5)
        return first_bytes == b"\rGINK"

    @staticmethod
    def dump(filepath: Union[Path, str]):
        filepath = Path(filepath)
        with filepath.open("rb") as handle:
            contents = handle.read()
        log_file_builder = LogFileBuilder.FromString(contents)
        print(log_file_builder)

    def _acquire_lock(self) -> bool:
        flocked_by_acquire = False
        if not self._flocked:
            flock(self._handle, LOCK_EX)
            flocked_by_acquire = self._flocked = True
        return flocked_by_acquire

    def _release_lock(self, flocked_by_acquire: bool, /):
        if flocked_by_acquire:
            assert self._flocked
            flock(self._handle, LOCK_UN)
            self._flocked = False

    def _add_claim(self, _: object, chain: Chain, /) -> ClaimBuilder:
        assert self._flocked
        claim_builder = super()._add_claim(True, chain)
        self._log_file_builder.Clear()
        self._log_file_builder.claims.append(claim_builder)
        data: bytes = self._log_file_builder.SerializeToString()  # type: ignore
        self._handle.write(data)
        self._handle.flush()
        self._processed_to += len(data)
        return claim_builder

    def _get_file_path(self) -> Optional[Path]:
        return self._filepath

    def _maybe_refresh(self):
        if self._flocked:
            return  # will have already refreshed inside an apply, and no new data is possible if exclusive
        current_location = self._handle.tell()
        if current_location != self._processed_to:
            raise AssertionError("%d != %d" % (current_location, self._processed_to))
        self._handle.seek(0, 2)
        end_of_file = self._handle.tell()
        if end_of_file != self._processed_to:
            self._handle.seek(self._processed_to, 0)
            flock(self._handle, LOCK_SH)
            self._flocked = True
            self._refresh_helper(False)
            flock(self._handle, LOCK_UN)
            self._flocked = False

    def _refresh_helper(self, _: Lock, callback: Optional[Callable[[Decomposition], None]]=None, /) -> int:
        assert self._handle.tell() == self._processed_to
        file_bytes = self._handle.read()
        if len(file_bytes) == 0:
            return 0
        self._log_file_builder.ParseFromString(file_bytes)  # type: ignore
        count = 0
        for bundle_bytes in self._log_file_builder.bundles:  # type: ignore # pylint: disable=maybe-no-member
            MemoryStore.apply_bundle(self, bundle_bytes, callback=callback)
            count += 1
        for claim_builder in self._log_file_builder.claims:
            self._claims[claim_builder.medallion] = claim_builder
        for key_pair_builder in self._log_file_builder.key_pairs:
            self._signing_keys[VerifyKey(key_pair_builder.public_key)] = SigningKey(key_pair_builder.secret_key)
        self._processed_to += len(file_bytes)
        assert self._handle.tell() == self._processed_to
        return count

    def apply_bundle(
            self,
            bundle: Union[Decomposition, bytes],
            callback: Optional[Callable[[Decomposition], None]]=None,
            claim_chain: bool=False,
            ) -> bool:
        if self._handle.closed:
            raise AssertionError("attempt to write to closed LogBackStore")
        if isinstance(bundle, bytes):
            bundle = Decomposition(bundle)
        assert isinstance(bundle, Decomposition)
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
            self._processed_to += len(data)
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
        self._is_closed = True

    def save_signing_key(self, signing_key: SigningKey):
        key_pair_builder = KeyPairBuilder()
        key_pair_builder.public_key = bytes(signing_key.verify_key)
        key_pair_builder.secret_key = bytes(signing_key)
        self._log_file_builder.Clear()
        self._log_file_builder.key_pairs.append(key_pair_builder)
        data: bytes = self._log_file_builder.SerializeToString()
        self._handle.write(data)
        self._handle.flush()
        self._processed_to += len(data)
        self._signing_keys[signing_key.verify_key] = signing_key
