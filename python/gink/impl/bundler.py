from abc import ABC, abstractmethod
from typing import Union
from .builders import ChangeBuilder, EntryBuilder, ContainerBuilder
from .muid import Muid


class Bundler(ABC):
    """ Manages construction and finalization of a bundle. """

    def __init__(self, comment: Optional[str]= None):
        pass

    @abstractmethod
    def add_change(self, builder: Union[ChangeBuilder, EntryBuilder, ContainerBuilder]) -> Muid:
        """ adds a single change (in the form of the proto builder) """

    @abstractmethod
    def commit(self) -> None:
        """ Finishes the bundle and adds it to the database. """
