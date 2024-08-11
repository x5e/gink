from typing import Optional

from .builders import BundleBuilder
from .bundle_info import BundleInfo
from .utilities import digest


class BundleWrapper:
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
            hex_hash = digest(self._bundle_bytes).hex()
            self._bundle_info = BundleInfo(builder=self.get_builder(), hex_hash=hex_hash)
        return self._bundle_info
