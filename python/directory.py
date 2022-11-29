from typing import Union
from typedefs import Muid
from behavior_pb2 import Behavior
from database import Database
from container import Container

class Directory(Container):
    _missing = object()
    BEHAVIOR = Behavior.SCHEMA

    def __init__(self, muid: Muid, database: Database):
        """ 
        Constructor for a directory proxy.

        muid: the global id of this directory, created on the fly if None
        db: database send commits through, or last db instance created if None
        """
        self._muid = muid
        self._database = database

    def __repr__(self):
        return "%s(%r)" % (self.__class__.__name__, self._muid)

    def __contains__(self, key):
        return self.has(key)
    
    def __getitem__(self, key):
        result = self.get(key, default=self._missing)
        if result == self._missing:
            raise KeyError(key)
        return result

    def __setitem__(self, key, value):
        self.set(key, value)

    def __delitem__(self, key):
        self.delete(self, key)

    def has(self, key, as_of):
        raise NotImplementedError()

    def get(self, key, default=None, as_of=None):
        # TODO(add change_set as parameter to see what's going to be changed)
        raise NotImplementedError()

    def set(self, key: Union[str, int], value, change_set=None):
        pass
        

    def delete(self, key, change_set=None):
        raise NotImplementedError()

    def items(self, as_of=None):
        raise NotImplementedError()

    def keys(self, as_of=None):
        raise NotImplementedError()

    def pop(self, key, default=None, change_set=None):
        raise NotImplementedError()

    def popitem(self):
        raise NotImplementedError()
