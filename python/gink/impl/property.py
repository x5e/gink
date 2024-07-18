""" Contains the `Property` Container class. """
from typing import Optional, Dict, Tuple, Iterable, Union
from typeguard import typechecked

from .typedefs import UserValue, GenericTimestamp
from .container import Container
from .addressable import Addressable
from .coding import PROPERTY, deletion
from .muid import Muid
from .database import Database
from .bundler import Bundler


class Property(Container):
    BEHAVIOR = PROPERTY

    @typechecked
    def __init__(
            self,
            muid: Optional[Union[Muid, str]] = None,
            *,
            arche: Optional[bool] = None,
            contents: Optional[Union[Dict[Union[Addressable, Muid], Union[UserValue, Container]],
                      Iterable[Tuple[Union[Addressable, Muid], Union[UserValue, Container]]]]] = None,
            database: Optional[Database] = None,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None,
    ):
        """
        Constructor for a property.

        muid: the global id of this container, created on the fly if None
        arche: whether this will be the global version of this container (accessible by all databases)
        contents: prefill the property with a dictionary upon initialization
        database: database send bundles through, or last db instance created if None
        bundler: the bundler to add changes to, or a new one if None and immediately commits
        comment: optional comment to add to the bundler
        """
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)

        Container.__init__(
                self,
                behavior=PROPERTY,
                muid=muid,
                arche=arche,
                database=database,
                bundler=bundler,
        )
        if contents:
            self.clear(bundler=bundler)
            self.update(contents, bundler=bundler)
        if immediate and len(bundler):
            self._database.bundle(bundler)

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ Dumps the contents of this property to a string.
        """
        if self._muid.medallion == -1 and self._muid.timestamp == -1:
            identifier = "arche=True"
        else:
            identifier = f"muid={self._muid!r}"
        result = f"""{self.__class__.__name__}({identifier}, contents="""
        result += "{"
        stuffing = [f"{k!r}:{v!r}" for k, v in self.items(as_of=as_of)]
        as_one_line = result + ",".join(stuffing) + "})"
        if len(as_one_line) < 80:
            return as_one_line
        result += "\n\t"
        result += ",\n\t".join(stuffing) + "})"
        return result

    def items(self, *, as_of: GenericTimestamp = None) -> Iterable[Tuple[Muid, Union[UserValue, Container]]]:
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=PROPERTY)
        for entry_pair in iterable:
            if entry_pair.builder.deletion:  # type: ignore
                continue
            muid = Muid.create(builder=entry_pair.builder.describing, context=entry_pair.address)
            value = self._get_occupant(entry_pair.builder, address=entry_pair.address)
            yield muid, value

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=PROPERTY)
        count = 0
        for thing in iterable:
            if not thing.builder.deletion:
                count += 1
        return count

    @typechecked
    def set(self, describing: Union[Addressable, Muid], value: Union[UserValue, Container], *,
            bundler=None, comment=None) -> Muid:
        """ Sets the value of the property on the particular object addressed by describing.

            Overwrites the value of this property on this object if previously set.
            Returns the muid of the new entry.
        """
        if hasattr(describing, "_muid"):
            describing = describing._muid
        return self._add_entry(key=describing, value=value, bundler=bundler, comment=comment)

    @typechecked
    def update(self, from_what: Union[Dict[Union[Addressable, Muid], Union[UserValue, Container]],
                                Iterable[Tuple[Union[Addressable, Muid], Union[UserValue, Container]]]],
                                *, bundler=None, comment=None):
        """
        Performs a shallow copy of key/value pairs from the argument.

        When from_what hasattr "keys", then will try: for k in E: D[k] = E[k]
        otherwise will try:  for k, v in E: D[k] = v
        """
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)
        if hasattr(from_what, "keys"):
            for key in from_what:
                self._add_entry(key=key, value=from_what[key], bundler=bundler) # type: ignore
        else:
            for key, val in from_what:
                self._add_entry(key=key, value=val, bundler=bundler)
        if immediate:
            self._database.bundle(bundler)

    @typechecked
    def delete(self, describing: Union[Addressable, Muid], *, bundler=None, comment=None) -> Muid:
        """ Removes the value (if any) of this property on object pointed to by `describing`. """
        if not hasattr(describing, "_muid"):
            raise ValueError("describing must be a container")
        return self._add_entry(key=describing._muid, value=deletion, bundler=bundler, comment=comment)

    @typechecked
    def get(self, describing: Union[Addressable, Muid], default: Union[UserValue, Container] = None, *,
            as_of: GenericTimestamp = None) -> Union[UserValue, Container]:
        """ Gets the value of the property on the object it's describing, optionally in the past.

        """
        if not hasattr(describing, "_muid"):
            raise ValueError("describing must be a container")
        as_of = self._database.resolve_timestamp(as_of)
        found = self._database.get_store().get_entry_by_key(self._muid, key=describing._muid, as_of=as_of)
        if found is None or found.builder.deletion:  # type: ignore
            return default
        value = self._get_occupant(found.builder, found.address)
        return value

Database.register_container_type(Property)
