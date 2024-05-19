from __future__ import annotations
from typing import *
from selectors import DefaultSelector
from contextlib import nullcontext

class Finished(BaseException):
    """ Thrown when FileObj is done receiving data and should be removed from selectable set and closed. """
    pass


class FileObj(Protocol):

    def fileno(self) -> int:
        """ return the underlying filehandle """

    def close(self):
        """ close the file object """

FileObjType = TypeVar('FileObjType', FileObj)


class SelectablePair(NamedTuple, Generic[FileObjType]):
    fileobj: FileObjType
    callback: Callable[[FileObjType], Optional[Iterable[SelectablePair]]]

def loop(
        pairs: Iterable[SelectablePair],
        context_manager = nullcontext(),
        ) -> None:
    for fileobj, callback in pairs:
        pass
    with context_manager:
        pass
