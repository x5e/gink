from __future__ import annotations
from typing import *
from selectors import DefaultSelector, BaseSelector, EVENT_READ
from contextlib import nullcontext
from logging import getLogger

from .utilities import GenericTimestamp, resolve_timestamp, generate_timestamp

class Finished(BaseException):
    """ Thrown when FileObj should be removed from selectable set and closed.

        The interface in selectors requires removal before the file/connection is closed,
        so I'm using throwing this exception to indicate that that should happen.
    """
    pass


class Selectable(Protocol):

    def fileno(self) -> int:
        """ return the underlying filehandle """

    def close(self):
        """ close the file object """

    def on_ready(self) -> Optional[Iterable[Selectable]]:
        """ what to call when selected """

    def is_closed(self) -> bool:
        """ return true if this object has been closed """


def loop(
        *selectables: Optional[Selectable],
        context_manager: ContextManager = nullcontext(),
        selector: Optional[BaseSelector] = None,
        until: GenericTimestamp = None,
        _logger = getLogger(__name__),
        ) -> None:
    selector = selector or DefaultSelector()
    assert isinstance(selector, BaseSelector)
    registered: Set[Selectable] = set()
    until_muts = None if until is None else resolve_timestamp(until)

    def add(_selectables: Iterable[Optional[Selectable]]):
        assert isinstance(selector, BaseSelector)
        for selectable_ in _selectables:
            if selectable_ and selectable_ not in registered:
                if hasattr(selectable_, "get_selectables"):
                    add(selectable_.get_selectables())
                selector.register(selectable_, EVENT_READ)
                registered.add(selectable_)

    add(selectables)
    with context_manager:
        while until_muts is None or generate_timestamp() < until_muts:
            try:
                selected = selector.select(0.1)
            except KeyboardInterrupt:
                break
            for selector_key, _ in selected:
                selectable = cast(Selectable, selector_key.fileobj)
                try:
                    results = selectable.on_ready()
                    if results:
                        add(results)
                except Finished as finished:
                    _logger.debug("removing connection", finished)
                    selector.unregister(selectable)
                    selectable.close()
                    registered.remove(selectable)
                    if selectable is context_manager:
                        until_muts = 0
            else:
                for selectable in registered:
                    if hasattr(selectable, "on_timeout"):
                        selectable.on_timeout()
        for selectable in registered:
            selector.unregister(selectable)
