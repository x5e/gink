

# protobuf builder
from behavior_pb2 import Behavior

# gink implementation
from typdefs import AsOf

class Queue(Container):
    BEHAVIOR = Behavior.Queue

    def __init__(self, *, contents=None, muid: Optional[Muid]=None, database=None):
        """
        Constructor for a queue proxy.

        muid: the global id of this queue, created on the fly if None
        database: where to send commits through, or last db instance created if None
        """
        database = database or Database.last
        change_set = ChangeSet()
        if muid is None:
            muid = Queue._create(Queue.BEHAVIOR, database=database, change_set=change_set)
        Container.__init__(self, muid=muid, database=database)
        self._muid = muid
        self._database = database
        if contents:
            # TODO: implement clear, then append all of the items 
        if len(change_set):
            self._database.add_change_set(change_set)

    def append(self, thing, change_set=None, comment=None, backdate=None):
        """ Append obect to the end of the queue. """
        return self._add_entry(key=key, value=value, change_set=change_set, 
            comment=comment, backdate=backdate)

    def pop(self, index=-1, muid=None, change_set=None):
        """ Remove and return an item at index (default last). """

    def remove(self, value, change_set=None):
        """ Remove first occurance of value. 

            Raises ValueError if the value is not present.
        """

    def to_list(self, as_of):
        """ Shallow dump of the contents of this queue.
        """

    def __getitem__(self, what):
        """ Gets the specified item, either index counting up from 
            zero, or negative number when counting from end,
            or whatever is found at an address in case of muid.
        """
        return self.at(what)

    def at(self, what, as_of=None):
        """ Returns the item at the specified index or muid,
   
            Raises IndexError if not present.
        """

    def __len__(self):
        """ Returns the current size of the list.
        """
        return self.size()
    
    def size(self, as_of=None):
        """ Tells the size at the specified as_of time.
        """
        raise NotImplementedError()

    def __contains__(self, item):
        """ Returns true if something matching item is in queue.
        """
