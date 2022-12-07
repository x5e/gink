""" the EntryKey class for internally ordering entries in the store """
from typing import NamedTuple, Optional

from muid import Muid
from typedefs import Key, MuTimestamp
from code_values import encode_key, decode_key, encode_int, decode_int

class EntryKey(NamedTuple):
    """ just a class to serialize / deserialize keys used to store entries 

        Notably, this will invert the entry muids so that more recent entries
        for a particular container / user-key come before earlier ones.
    """
    container: Muid
    user_key: Optional[Key]
    entry_muid: Muid
    expiry: Optional[MuTimestamp]

    def replace_time(self, timestamp: int):
        """ create a entry key that can be used for seeking before the given time """
        return EntryKey(self.container, self.user_key, Muid(timestamp, 0,0,), None)

    def __bytes__(self):
        serialized_key = encode_key(self.user_key).SerializeToString() # type: ignore
        return (bytes(self.container) + serialized_key +
            bytes(self.entry_muid.invert()) + encode_int(self.expiry or 0))

    @classmethod
    def from_bytes(cls, data: bytes):
        """ creates an entry key from its binary format """
        container_bytes = data[0:16]
        user_key_bytes = data[16:-24]
        entry_muid_bytes = data[-24:-8]
        expiry_bytes = data[-8:]
        return cls(
                container=Muid.from_bytes(container_bytes),
                user_key=decode_key(user_key_bytes),
                entry_muid=Muid.from_bytes(entry_muid_bytes).invert(),
                expiry=MuTimestamp(decode_int(expiry_bytes)) or None)

    def __lt__(self, other):
        # I'm override sort here because I want the same sort order of the binary representation,
        # which will be a little bit different because of flipping the entry muids.
        # Also, sorting would break because keys can be either ints or strings
        return bytes(self) < bytes(other)
