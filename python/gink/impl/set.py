""" Contains the set class definition """

from typing import Union, Optional, Iterable

from .database import Database
from .muid import Muid

from .muid import Muid
from .database import Database
from .container import Container
from .coding import KEY_SET, deletion, decode_key, inclusion
from .bundler import Bundler
from .typedefs import UserKey, GenericTimestamp

class Set(Container):
    _missing = object()
    BEHAVIOR = KEY_SET

    def __init__(self, root: Optional[bool] = None, bundler: Optional[Bundler] = None, contents = None, 
                 muid: Optional[Muid] = None, database = None, comment: Optional[str] = None):
        """
        Constructor for a set proxy.
        
        muid: the global id of this set, created on the fly if None
        db: database to send commits through, or last db instance created if None
        """
        if root:
            muid = Muid(-1, -1, KEY_SET)
        database = database or Database.get_last()
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)
        if muid is None:
            muid = Container._create(KEY_SET, database=database, bundler=bundler)
        elif muid.timestamp > 0 and contents:
            # TODO [P3] check the store to make sure that the container is defined and compatible (possibly for set as well?)
            pass
        Container.__init__(self, muid=muid, database=database)
        if contents:
            self.clear(bundler=bundler)
            # self.update(contents, bundler=bundler)
        if immediate and len(bundler):
            self._database.commit(bundler)

    def add(self, key: UserKey, *, bundler=None, comment=None):
        """ Adds a value to the set """
        return self._add_entry(key=key, value=inclusion, bundler=bundler, comment=comment)
    
    def items(self, *, as_of=None):
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(container=self._muid, as_of=as_of, behavior=KEY_SET)
        for entry_pair in iterable:
            print(entry_pair.builder)
            if entry_pair.builder.deletion:
                continue
            key = decode_key(entry_pair.builder)
            yield key
    def size(self, *, as_of: GenericTimestamp = None) -> int:
        """ returns the number of elements contained """
        raise NotImplementedError()

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ return the contents of this container as a string """
        raise NotImplementedError()