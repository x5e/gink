""" Contains the `Property` Container class. """
from __future__ import annotations
from typing import Optional, Dict, Tuple, Iterable, Union

from .typedefs import UserValue, GenericTimestamp
from .container import Container
from .coding import deletion
from .muid import Muid
from .database import Database
from .bundler import Bundler
from .graph import Edge
from .builders import Behavior


class Property(Container):
    BEHAVIOR = Behavior.PROPERTY

    def __init__(self, *, root: bool=False, muid: Optional[Muid] = None, database: Optional[Database]=None,
                 contents: Optional[Dict[Union[Container, Edge], Union[UserValue, Container]]]=None):
        """
        Constructor for a property definition.

        muid: the global id of this directory, created on the fly if None
        db: database send commits through, or last db instance created if None
        """
        database = database or Database.get_last()
        bundler = Bundler()
        if root:
            muid = Muid(-1, -1, self.BEHAVIOR)
        if muid is None:
            muid = Container._create(self.BEHAVIOR, database=database, bundler=bundler)
        Container.__init__(self, muid=muid, database=database)
        if contents:
            for key, val in contents.items():
                self.set(key, val, bundler=bundler)
        if len(bundler):
            self._database.commit(bundler)

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ Dumps the contents of this property to a string.
        """
        if self._muid.medallion == -1 and self._muid.timestamp == -1:
            identifier = "root=True"
        else:
            identifier = repr(str(self._muid))
        result = f"""{self.__class__.__name__}({identifier}, contents="""
        result += "{"
        stuffing = [f"{k!r}:{v!r}" for k, v in self.items(as_of=as_of)]
        as_one_line = result + ",".join(stuffing) + "})"
        if len(as_one_line) < 80:
            return as_one_line
        result += "\n\t"
        result += ",\n\t".join(stuffing) + "})"
        return result

    def items(self, *, as_of: GenericTimestamp = None) -> Iterable[Tuple[Container, Union[UserValue, Container]]]:
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=self.BEHAVIOR)
        for entry_pair in iterable:
            if entry_pair.builder.deletion:  # type: ignore
                continue
            muid = Muid.create(builder=entry_pair.builder.describing, context=entry_pair.address)
            value = self._get_occupant(entry_pair.builder, address=entry_pair.address)
            yield (self._database.get_container(muid), value)

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=self.BEHAVIOR)
        count = 0
        for thing in iterable:
            if not thing.builder.deletion:
                count += 1
        return count

    def set(self, describing: Union[Container, Edge], value: Union[UserValue, Container], *,
            bundler=None, comment=None) -> Muid:
        """ Sets the value of the property on the particular object addressed by describing.

            Overwrites the value of this property on this object if previously set.
            Returns the muid of the new entry.
        """
        return self._add_entry(key=describing._muid, value=value, bundler=bundler, comment=comment)

    def delete(self, describing: Union[Container, Edge], *, bundler=None, comment=None) -> Muid:
        """ Removes the value (if any) of this property on object pointed to by `describing`. """
        return self._add_entry(key=describing._muid, value=deletion, bundler=bundler, comment=comment)

    def get(self, describing: Union[Container, Edge], default: Union[UserValue, Container] = None, *,
            as_of: GenericTimestamp = None) -> Union[UserValue, Container]:
        """ Gets the value of the property on the object it's describing, optionally in the past.

        """
        as_of = self._database.resolve_timestamp(as_of)
        found = self._database.get_store().get_entry_by_key(self._muid, key=describing._muid, as_of=as_of)
        if found is None or found.builder.deletion:  # type: ignore
            return default
        value = self._get_occupant(found.builder, found.address)
        return value
