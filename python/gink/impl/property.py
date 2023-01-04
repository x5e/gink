""" Contains the `Property' Container class. """
from typing import Optional, Union

from .typedefs import UserValue, GenericTimestamp
from .container import Container
from .coding import PROPERTY, deletion
from .muid import Muid
from .database import Database
from .bundler import Bundler

class Property(Container):
    BEHAVIOR = PROPERTY

    def __init__(self, *, contents=None, muid: Optional[Muid]=None, database=None):
        """
        Constructor for a property definition.

        muid: the global id of this directory, created on the fly if None
        db: database send commits through, or last db instance created if None
        """
        database = database or Database.last
        bundler = Bundler()
        if muid is None:
            muid = Container._create(PROPERTY, database=database, bundler=bundler)
        Container.__init__(self, muid=muid, database=database)
        if contents:
            raise NotImplementedError()
        if len(bundler):
            self._database.commit(bundler)

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

    def get(self, describing: Union[Muid, Container], default: UserValue=None, *, 
            as_of: GenericTimestamp=None) -> UserValue:
        """ Gets the value of the property on the object it's describing, optionally in the past.
        
        """
        if isinstance(describing, Container):
            describing = describing._muid
        as_of = self._database.resolve_timestamp(as_of)
        found = self._database._store.get_entry_by_key(self._muid, key=describing, as_of=as_of)
        if found is None or found.builder.deletion:  # type: ignore
            return default
        return self._get_occupant(found.builder)
