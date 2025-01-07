from __future__ import annotations
from types import TracebackType
from abc import ABC, abstractmethod
from typing import Optional, Type, Union
from threading import local as Local

from .builders import ChangeBuilder, EntryBuilder, ContainerBuilder
from .muid import Muid

__all__ = ["Bundler"]


class Bundler(ABC):
    """ Manages construction and finalization of a bundle. """
    _local = Local()

    def __enter__(self):
        if hasattr(Bundler._local, "active"):
            raise Exception("already in a context")
        Bundler._local.active = self
        return self

    def __exit__(
        self, /,
        exc_type: Optional[Type[BaseException]],
        exc_value: Optional[BaseException],
        traceback: Optional[TracebackType]
    ):
        assert Bundler._local.active == self
        del Bundler._local.active
        if exc_type is None:
            self.commit()
        else:
            assert exc_value is not None and traceback is not None
            self.rollback()

    @abstractmethod
    def __len__(self) -> int:
        """ return the number of changes in this bundle """

    def __bool__(self) -> bool:
        return True

    @staticmethod
    def get_active() -> Optional[Bundler]:
        return getattr(Bundler._local, "active", None)

    @abstractmethod
    def add_change(self, builder: Union[ChangeBuilder, EntryBuilder, ContainerBuilder]) -> Muid:
        """ adds a single change (in the form of the proto builder) """

    @abstractmethod
    def commit(self):
        """ Finishes the bundle and adds it to the database. """

    @abstractmethod
    def is_open(self) -> bool:
        """ Figure out if this bundler can still accept changes. """

    @abstractmethod
    def rollback(self):
        """ Abandon the bundle. """
