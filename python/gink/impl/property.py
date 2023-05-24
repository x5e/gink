""" Contains the `Property` Container class. """
from __future__ import annotations
from typing import Optional, Union, Dict, Tuple, Iterable

from .typedefs import UserValue, GenericTimestamp
from .container import Container
from .coding import PROPERTY, deletion
from .muid import Muid
from .database import Database
from .bundler import Bundler


class Property(Container):
    BEHAVIOR = PROPERTY

    def __init__(self, *, root=False, contents: Optional[Dict[Muid, UserValue]]=None, muid: Optional[Muid] = None, database=None):
        """
        Constructor for a property definition.

        muid: the global id of this directory, created on the fly if None
        db: database send commits through, or last db instance created if None
        """
        database = database or Database.get_last()
        bundler = Bundler()
        if root:
            muid = Muid(-1, -1, PROPERTY)
        if muid is None:
            muid = Container._create(PROPERTY, database=database, bundler=bundler)
        Container.__init__(self, muid=muid, database=database)
        if contents:
            for key, val in contents.items():
                self.set(key, val, bundler=bundler)
        if len(bundler):
            self._database.commit(bundler)

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ Dumps the contents of this role to a string.
        """
        if self._muid.medallion == -1 and self._muid.timestamp == -1:
            identifier = "root=True"
        else:
            identifier = repr(str(self._muid))
        result = f"""{self.__class__.__name__}({identifier}, contents="""
        result += "{"
        stuffing = [f"{k!r}:{v!r}" for k, v in self._items(as_of=as_of)]
        as_one_line = result + ",".join(stuffing) + "})"
        if len(as_one_line) < 80:
            return as_one_line
        result += "\n\t"
        result += ",\n\t".join(stuffing) + "})"
        return result

    def _items(self, *, as_of: GenericTimestamp = None) -> Iterable[Tuple[Muid, UserValue]]:
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=PROPERTY)
        for entry_pair in iterable:
            if entry_pair.builder.deletion:  # type: ignore
                continue
            muid = Muid.create(builder=entry_pair.builder.describing, context=entry_pair.address)
            value = self._get_occupant(entry_pair.builder)
            assert not isinstance(value, Container)
            yield (muid, value)

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        return len(list(self._items(as_of=as_of)))

    def set(self, describing: Union[Muid, Container], value: UserValue, *,
            bundler=None, comment=None) -> Muid:
        """ Sets the value of the property on the particular object addressed by describing.

            Overwrites the value of this property on this object if previously set.
            Returns the muid of the new entry.
        """
        if isinstance(describing, Container):
            describing = describing._muid
        return self._add_entry(key=describing, value=value, bundler=bundler, comment=comment)

    def delete(self, describing: Union[Muid, Container], *, bundler=None, comment=None) -> Muid:
        """ Removes the value (if any) of this property on object pointed to by `describing`. """
        if isinstance(describing, Container):
            describing = describing._muid
        return self._add_entry(key=describing, value=deletion, bundler=bundler, comment=comment)

    def get(self, describing: Union[Muid, Container], default: UserValue = None, *,
            as_of: GenericTimestamp = None) -> UserValue:
        """ Gets the value of the property on the object it's describing, optionally in the past.

        """
        if isinstance(describing, Container):
            describing = describing._muid
        as_of = self._database.resolve_timestamp(as_of)
        found = self._database.get_store().get_entry_by_key(self._muid, key=describing, as_of=as_of)
        if found is None or found.builder.deletion:  # type: ignore
            return default
        value = self._get_occupant(found.builder)
        assert not isinstance(value, Container)
        return value
