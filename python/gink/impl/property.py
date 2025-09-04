""" Contains the `Property` Container class. """
from typing import Optional, Dict, Tuple, Iterable, Union, cast
from typeguard import typechecked

from .typedefs import UserValue, GenericTimestamp
from .container import Container
from .addressable import Addressable
from .coding import PROPERTY, deletion
from .muid import Muid
from .database import Database
from .bundler import Bundler
from .utilities import experimental


@experimental
class Property(Container):
    _BEHAVIOR = PROPERTY
    _MISSING = object()

    @typechecked
    def __init__(
            self,
            *,
            muid: Optional[Union[Muid, str]] = None,
            contents: Optional[Union[Dict[Union[Addressable, Muid], Union[UserValue, Container]],
                      Iterable[Tuple[Union[Addressable, Muid], Union[UserValue, Container]]]]] = None,
            database: Optional[Database] = None,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None,
    ):
        """
        Constructor for a property.

        muid: the global id of this container, created on the fly if None
        contents: prefill the property with a dictionary upon initialization
        database: database send bundles through, or last db instance created if None
        bundler: the bundler to add changes to, or a new one if None and immediately commits
        comment: optional comment to add to the bundler
        """
        database = database or Database.get_most_recently_created_database()
        immediate = False
        if bundler is None:
            immediate = True
            bundler = database.bundler(comment)
        created = False
        if isinstance(muid, str):
            muid = Muid.from_str(muid)
        elif muid is None:
            muid = Container._create(PROPERTY, bundler=bundler)
            created = True
        assert isinstance(muid, Muid)
        Container.__init__(self, muid=muid, database=database)
        if contents:
            if not created:
                self.clear(bundler=bundler)
            self.update(contents, bundler=bundler)
        if immediate and len(bundler):
            bundler.commit()

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ Dumps the contents of this property to a string. """
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
        """ Returns an iterable of (describing_muid, value) pairs for all entries in this property. """
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
        if isinstance(describing, Addressable):
            describing = describing._muid
        return self._add_entry(key=describing, value=value, bundler=bundler, comment=comment)

    @typechecked
    def update(self, from_what: Union[Dict[Union[Addressable, Muid], Union[UserValue, Container]],
                                Iterable[Tuple[Union[Addressable, Muid], Union[UserValue, Container]]]],
                                *, bundler=None, comment=None):
        """ Performs a shallow copy of key/value pairs from the argument.

            When from_what hasattr "keys", then will try: for k in E: D[k] = E[k]
            otherwise will try:  for k, v in E: D[k] = v
        """
        immediate = False
        if bundler is None:
            immediate = True
            bundler = self._database.bundler(comment)
        if hasattr(from_what, "keys"):
            for key in from_what:
                self._add_entry(key=key, value=from_what[key], bundler=bundler) # type: ignore
        else:
            from_what = cast(Iterable[Tuple[Union[Addressable, Muid], Union[UserValue, Container]]], from_what)
            for key, val in from_what:
                self._add_entry(key=key.get_muid(), value=val, bundler=bundler)
        if immediate:
            bundler.commit()

    @typechecked
    def delete(self, describing: Union[Addressable, Muid], *, bundler=None, comment=None) -> Muid:
        """ Removes the value (if any) of this property on object pointed to by `describing`. """
        muid = cast(Muid, getattr(describing, "_muid", describing))
        return self._add_entry(key=muid, value=deletion, bundler=bundler, comment=comment)

    def get(self, describing: Union[Addressable, Muid], default: Union[UserValue, Container] = None, *,
            as_of: GenericTimestamp = None) -> Union[UserValue, Container]:
        """ Gets the value of the property on the object it's describing, optionally in the past. """
        if not hasattr(describing, "_muid"):
            raise ValueError("describing must be a container")
        as_of = self._database.resolve_timestamp(as_of)
        found = self._database.get_store().get_entry_by_key(self._muid, key=describing.get_muid(), as_of=as_of)
        if found is None or found.builder.deletion:  # type: ignore
            return default
        value = self._get_occupant(found.builder, found.address)
        return value

    def __getitem__(self, key: Union[Addressable, Muid]) -> Union[UserValue, Container]:
        """ Gets the value of the property on the object it's describing. """
        found = self.get(describing=key, default=self._MISSING)  # type: ignore
        if found is self._MISSING:
            raise KeyError(key)
        return found

    def __setitem__(self, key: Union[Addressable, Muid], value: Union[UserValue, Container]):
        """ Sets the value of the property on the object it's describing. """
        self.set(describing=key, value=value)
