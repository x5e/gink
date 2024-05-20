from __future__ import annotations
from typing import *
from selectors import DefaultSelector, BaseSelector, EVENT_READ
from contextlib import nullcontext

class Finished(BaseException):
    """ Thrown when FileObj is done receiving data and should be removed from selectable set and closed. """
    pass


class Selectable(Protocol):

    def fileno(self) -> int:
        """ return the underlying filehandle """

    def close(self):
        """ close the file object """

    def on_ready(self) -> Optional[Iterable[Selectable]]:
        """ what to call when selected """


def loop(
        selectables: Iterable[Selectable],
        context_manager: ContextManager = nullcontext(),
        selector: BaseSelector = DefaultSelector(),
        ) -> None:
    registered: Set[Selectable] = set()

    def add(_selectables):
        for selectable in _selectables:
            if selectable and selectable not in registered:
                selector.register(selectable, EVENT_READ)

    with context_manager:
        add(selectables)
        for selector_key, _ in selector.select(0.1):
            selectable = cast(Selectable, selector_key.fileobj)
            try:
                results = selectable.on_ready()
                if results:
                    add(results)
            except Finished:
                selector.unregister(selectable)
                selectable.close()
        else:
            for selectable in registered:
                if hasattr(selectable, "on_timeout"):
                    selectable.on_timeout()
