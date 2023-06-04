""" Contains the set class definition """

from typing import Union, Optional, Iterable

from python.gink.impl.database import Database
from python.gink.impl.muid import Muid

from .muid import Muid
from .database import Database
from .container import Container
from .coding import SET, deletion
from .bundler import Bundler
from .typedefs import UserKey, GenericTimestamp

class Set(Container):
    _missing = object()
    BEHAVIOR = SET

    def __init__(self, root: Optional[bool] = None, bundler: Optional[Bundler] = None, contents = None, 
                 muid: Optional[Muid] = None, database = None, comment: Optional[str] = None):
        """
        Constructor for a set proxy.
        
        muid: the global id of this set, created on the fly if None
        db: database to send commits through, or last db instance created if None
        """
        if root:
            muid = Muid(-1, -1, SET)
        database = database or Database.get_last()
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)
        if muid is None:
            muid = Container._create(SET, database=database, bundler=bundler)
        elif muid.timestamp > 0 and contents:
            # TODO [P3] check the store to make sure that the container is defined and compatible (possibly for set as well?)
            pass
        Container.__init__(self, muid=muid, database=database)
        if contents:
            self.clear(bundler=bundler)
            # self.update(contents, bundler=bundler)
        if immediate and len(bundler):
            self._database.commit(bundler)

    def add(self, value, *, bundler=None, comment=None):
        """ Adds a value to the set """
        return self._add_entry(value=value, bundler=bundler, comment=comment)
    
    def items(self, *, as_of=None):
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(container=self._muid, as_of=as_of, behavior=SET)
        for entry_pair in iterable:
            if entry_pair.builder.deletion:
                continue
            contained = self._get_occupant(entry_pair.builder, entry_pair.address)
            yield contained