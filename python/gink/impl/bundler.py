from abc import ABC, abstractmethod
from typing import *
from .builders import ChangeBuilder, EntryBuilder, ContainerBuilder
from .muid import Muid
from types import TracebackType

__all__ = ["Bundler"]

class Bundler(ABC):
    """ Manages construction and finalization of a bundle. """

    def __enter__(self):
        return self

    @abstractmethod
    def __exit__(
        self, /,
        exc_type: Optional[Type[BaseException]],
        exc_value: Optional[BaseException],
        traceback: Optional[TracebackType]
    ) -> Optional[bool]:
        """ exit context management """

    @abstractmethod
    def __len__(self) -> int:
        """ return the number of changes in this bundle """

    @abstractmethod
    def add_change(self, builder: Union[ChangeBuilder, EntryBuilder, ContainerBuilder]) -> Muid:
        """ adds a single change (in the form of the proto builder) """

    @abstractmethod
    def commit(self):
        """ Finishes the bundle and adds it to the database. """
