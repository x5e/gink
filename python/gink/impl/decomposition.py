from typing import Optional

from .builders import BundleBuilder
from .bundle_info import BundleInfo
from nacl.hash import blake2b
from nacl.encoding import RawEncoder


class Decomposition:
    def __init__(self, bundle_bytes: bytes, bundle_info: Optional[BundleInfo] = None):
        self._bundle_bytes = bundle_bytes
        self._body_bytes = self._bundle_bytes[64:]
        self._bundle_builder: Optional[BundleBuilder] = None
        self._bundle_info: Optional[BundleInfo] = bundle_info

    def get_bytes(self):
        return self._bundle_bytes

    def get_builder(self) -> BundleBuilder:
        if self._bundle_builder is None:
            self._bundle_builder = BundleBuilder()
            self._bundle_builder.ParseFromString(self._body_bytes)
        return self._bundle_builder

    def get_info(self) -> BundleInfo:
        if self._bundle_info is None:
            hex_hash = blake2b(self._bundle_bytes, digest_size=32, encoder=RawEncoder).hex()
            self._bundle_info = BundleInfo(builder=self.get_builder(), hex_hash=hex_hash)
        return self._bundle_info

    def __len__(self) -> int:
        builder = self.get_builder()
        changes = builder.changes
        return len(changes)

    def __bool__(self) -> bool:
        return True
