from typing import Optional

#gink implementation
from .typedefs import GenericTimestamp
from .container import Container
from .muid import Muid
from .database import Database
from .bundler import Bundler
from .coding import BOX


class Box(Container):
    BEHAVIOR = BOX

    def __init__(self,
                 muid: Optional[Muid] = None,
                 database: Optional[Database] = None,
                 arche: bool = False,
                 bundler: Optional[Bundler] = None,
                 contents = None,
                 comment: Optional[str] = None,
                 ):
        """
        muid: the global id of this sequence, created on the fly if None
        database: where to send bundles through, or last db instance created if None
        """
        if arche:
            muid = Muid(-1, -1, BOX)
        database = database or Database.get_last()
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)
        if muid is None:
            muid = Container._create(
                BOX, database=database, bundler=bundler)
        Container.__init__(self, muid=muid, database=database)
        self._muid = muid
        self._database = database
        if contents is not None:
            self.clear(bundler=bundler)
            self.set(contents, bundler=bundler)
        if immediate and len(bundler):
            self._database.bundle(bundler)

    def set(self, value, *, bundler=None, comment=None):
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
            identifier = repr(str(self._muid))

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
