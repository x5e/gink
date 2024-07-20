from typing import Optional, Union
from typeguard import typechecked


# gink implementation
from .typedefs import GenericTimestamp, UserValue
from .container import Container
from .muid import Muid
from .database import Database
from .bundler import Bundler
from .coding import BOX


class Box(Container):
    BEHAVIOR = BOX

    @typechecked
    def __init__(
            self,
            muid: Optional[Union[Muid, str]] = None,
            *,
            arche: Optional[bool] = None,
            contents: Union[UserValue, Container] = None,
            database: Optional[Database] = None,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None,
    ):
        """
        Constructor for a box proxy.

        muid: the global id of this container, created on the fly if None
        arche: whether this will be the global version of this container (accessible by all databases)
        contents: prefill the box with a value upon initialization
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
            behavior=BOX,
            muid=muid,
            arche=arche,
            database=database,
            bundler=bundler,
        )

        if contents is not None:
            self.clear(bundler=bundler)
            self.set(contents, bundler=bundler)

        if immediate and len(bundler):
            self._database.bundle(bundler)

    @typechecked
    def set(self, value: Union[UserValue, Container], *, bundler=None, comment=None):
        """ Sets a value in the box, returns the muid address of the entry.

            If bundler is specified, then simply adds an entry to that bundler.
            If no bundler is specified, then creates one just for this entry,
            sets its comment to the comment arg (if set) then adds it to the database.

        """
        return self._add_entry(value=value, bundler=bundler, comment=comment)

    def get(self, default=None, *, as_of: GenericTimestamp = None):
        """ gets the value in the box, optionally as_of a time """
        as_of = self._database.resolve_timestamp(as_of)
        found = self._database.get_store().get_entry_by_key(container=self._muid, key=None, as_of=as_of)

        if found is None or found.builder.deletion:  # type: ignore
            return default

        contents = self._get_occupant(found.builder, found.address)

        return contents

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ Dumps the contents of this box to a string. """
        if self._muid.medallion == -1 and self._muid.timestamp == -1:
            identifier = "arche=True"
        else:
            identifier = f"muid={self._muid!r}"

        as_of = self._database.resolve_timestamp(as_of)
        found = self._database.get_store().get_entry_by_key(container=self._muid, key=None, as_of=as_of)

        if found is None or found.builder.deletion:  # type: ignore
            return f"""{self.__class__.__name__}({identifier}, contents={None})"""

        contents = self._get_occupant(found.builder, found.address)

        result = f"""{self.__class__.__name__}({identifier}, contents={repr(contents)})"""
        return result

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        as_of = self._database.resolve_timestamp(as_of)
        found = self._database.get_store().get_entry_by_key(container=self._muid, key=None, as_of=as_of)

        return 1 if found else 0

    def is_empty(self, *, as_of: GenericTimestamp = None) -> int:
        return True if self.size(as_of=as_of) == 0 else False


Database.register_container_type(Box)
