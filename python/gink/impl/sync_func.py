from typing import Protocol, Any
from pathlib import Path

from .builders import SyncMessage


class SyncFunc(Protocol):
    def __call__(self, *, path: Path, perms: int, misc: Any) -> SyncMessage:
        """ Generate the greeting on a new connection. """
