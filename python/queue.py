class Queue:

    def append(self, thing, change_set=None):
        """ Append obect to the end of the queue. """

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