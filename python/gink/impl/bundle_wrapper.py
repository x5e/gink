from typing import Optional
from .builders import BundleBuilder
from .bundle_info import BundleInfo


class BundleWrapper:
    def __init__(self, bundle_bytes: bytes, bundle_info: Optional[BundleInfo] = None):
        self._bundle_bytes = bundle_bytes
        self._bundle_builder: Optional[BundleBuilder] = None
        self._bundle_info: Optional[BundleInfo] = bundle_info

    def get_bytes(self):
        return self._bundle_bytes

    def get_builder(self) -> BundleBuilder:
        if self._bundle_builder is None:
            self._bundle_builder = BundleBuilder()
            self._bundle_builder.ParseFromString(self._bundle_bytes)
        return self._bundle_builder

    def get_info(self) -> BundleInfo:
        if self._bundle_info is None:
            self._bundle_info = BundleInfo(builder=self.get_builder().header)
        return self._bundle_info
