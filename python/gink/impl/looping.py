from typing import *
from selectors import DefaultSelector, BaseSelector, EVENT_READ
from contextlib import nullcontext
from logging import getLogger

from .utilities import GenericTimestamp, resolve_timestamp, generate_timestamp
from .typedefs import Selectable, Finished

def loop(
        *selectables: Optional[Selectable],
        context_manager: Optional[ContextManager] = None,
        selector: Optional[BaseSelector] = None,
        until: GenericTimestamp = None,
        _logger = getLogger(__name__),
        ) -> None:
    """ Select loop for handling multiple Selectables. A Selectable is an object that has a fileno method and
        can be registered with a selector. For example, a websocket connection or a Console. The loop will call
        the on_ready method of the Selectable when it is ready to be read from. The loop will continue until the
        until timestamp is reached, or until the program is exited.
    """
    selector = selector or DefaultSelector()
    assert isinstance(selector, BaseSelector)
    registered: Set[Selectable] = set()
    until_muts = None if until is None else resolve_timestamp(until)

    def add(_selectables: Iterable[Optional[Selectable]]):
        """ Add selectables to the selector """
        assert isinstance(selector, BaseSelector)
        for selectable_ in _selectables:
            if selectable_ and selectable_ not in registered:
                if hasattr(selectable_, "get_selectables"):
                    add(selectable_.get_selectables())
                selector.register(selectable_, EVENT_READ)
                registered.add(selectable_)

    add(selectables)
    context_manager = context_manager or nullcontext()
    with context_manager:
        while until_muts is None or generate_timestamp() < until_muts:
            try:
                selected = selector.select(0.01)
            except KeyboardInterrupt:
                break
            for selector_key, _ in selected:
                selectable = cast(Selectable, selector_key.fileobj)
                try:
                    results = selectable.on_ready()
                    if results:
                        add(results)
                except Finished as finished:
                    _logger.debug("removing connection %s", finished)
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
