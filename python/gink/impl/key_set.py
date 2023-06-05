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
from .builders import Behavior, EntryBuilder

class KeySet(Container):
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

    def add(self, key: UserKey, *, bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Adds a specified value to the key set """
        return self._add_entry(key=key, value=inclusion, bundler=bundler, comment=comment)
    
    def update(self, keys: list[UserKey], bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Adds multiple specified values to the key set """
        # Probably best to initialize a bundler here
        for key in keys:
            self._add_entry(key=key, value=inclusion, bundler=bundler, comment=comment)

    def discard(self, key: UserKey, bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Deletes a specified entry from the key set """
        return self._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)
    
    def remove(self, key: UserKey, bundler: Optional[Bundler]=None, comment: Optional[str]=None):
        """ Deletes a specified entry from the key set, but returns KeyError if not found """
        as_of = self._database.get_now()
        found = self._database.get_store().get_entry_by_key(self.get_muid(), key=key, as_of=as_of)
        if found is None or found.builder.deletion:  # type: ignore
            raise KeyError("Key does not exist")
        else:
            return self._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)
    
    def pop(self, key: UserKey, bundler: Optional[Bundler]=None, comment: Optional[str]=None, default=None):
        """ If key exists in the mapping, returns the corresponding value and removes it.

            Otherwise returns default.  In the case that the key is found and removed,
            then the change is added to the bundler (or committed immedately with comment
            if no bundler is specified.)
        """
        as_of = self._database.get_now()
        found = self._database.get_store().get_entry_by_key(self.get_muid(), key=key, as_of=as_of)
        if found is None or found.builder.deletion:  # type: ignore
            return default
        self._add_entry(key=key, value=deletion, bundler=bundler, comment=comment)
        return decode_key(found.builder)
    
    def issuperset(self, *, subset: Union[set, list], as_of: GenericTimestamp=None):
        """ Returns a Boolean stating whether the key set contains the specified set or list of keys """
        for element in subset:
            if element not in set(self.items(as_of=as_of)):
                return False
        return True

    def items(self, *, as_of: GenericTimestamp=None):
        """ returns an iterable of all items in the key set """
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(container=self._muid, as_of=as_of, behavior=KEY_SET)
        for entry_pair in iterable:
            if entry_pair.builder.deletion:
                continue
            key = decode_key(entry_pair.builder)
            yield key

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        """ returns the number of elements contained """
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=Behavior.KEY_SET)
        
        count = 0
        for entry_pair in iterable:
            if not entry_pair.builder.deletion:
                count += 1
        return count

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ return the contents of this container as a string """
        as_of = self._database.resolve_timestamp(as_of)
        identifier = repr(str(self._muid))
        result = f"""{self.__class__.__name__}({identifier}, contents="""
        result += "{"
        stuffing = [decode_key(entry_pair.builder) for entry_pair in self._database.get_store().get_keyed_entries(container=self._muid, behavior=self.BEHAVIOR, as_of=as_of)]
        as_one_line = result + ",".join(stuffing) + "})"
        if len(as_one_line) < 80:
            return as_one_line
        result += "\n\t"
        result += ",\n\t".join(stuffing) + "})"
        return result
    
