from struct import Struct
from change_set_pb2 import ChangeSet as ChangeSetBuilder

class ChangeSetInfo(object):
    _qqqq = Struct(">QQQQ")
    __slots__ = ["timestamp", "medallion", "chain_start", "prior_time", "comment"]
    medallion: int
    timestamp: int
    chain_start: int
    prior_time: int
    comment: str

    def __init__(self, *, changeSetBytes: bytes=b'', encoded: bytes=b'\x00'*32, **kwargs):

        (self.timestamp, self.medallion, self.chain_start, self.prior_time) = self._qqqq.unpack(encoded[0:32])
        self.comment = encoded[32:].decode()

        if changeSetBytes:
            changeSetBuilder = ChangeSetBuilder()
            changeSetBuilder.ParseFromString(changeSetBytes)  # type: ignore
            self.medallion = changeSetBuilder.medallion  # type: ignore
            self.timestamp = changeSetBuilder.timestamp # type: ignore
            self.chain_start = changeSetBuilder.chain_start  # type: ignore
            self.prior_time = changeSetBuilder.previous_timestamp  # type: ignore
            self.comment = changeSetBuilder.comment  # type: ignore

        if kwargs:
            for key in self.__slots__:
                if key in kwargs:
                    setattr(self, key, kwargs[key])

        if not (isinstance(self.medallion, int) and self.medallion > 0):
            raise ValueError(f'medallion({self.medallion}) is invalid')
        if not (isinstance(self.timestamp, int) and self.timestamp > 0):
            raise ValueError(f'timestamp({self.timestamp}) is invalid')
        if not (isinstance(self.chain_start, int) and self.chain_start > 0 and self.chain_start <= self.timestamp):
            raise ValueError(f'chain_start({self.chain_start}) is invalid')
        if not isinstance(self.prior_time, int):
            raise ValueError(f"prior_time({self.prior_time}) is invalid")
        if self.prior_time != 0 or self.timestamp > self.chain_start:
            if not (self.chain_start <= self.prior_time < self.timestamp):
                raise ValueError("prior_time isn't between chain_start and timestamp") 

    def __bytes__(self) -> bytes:
        numbers = self._qqqq.pack(
            self.timestamp, self.medallion, self.chain_start, self.prior_time)
        return numbers + self.comment.encode()

    def __lt__(self, other):
        return (self.timestamp < other.timestamp or (
            self.timestamp == other.timestamp and self.medallion < other.medallion))

    def __repr__(self) -> str:
        contents = ", ".join([f"{attr}={repr(getattr(self,attr))}" for attr in self.__slots__ if getattr(self,attr)])
        return self.__class__.__name__ + '(' + contents + ')'

    def __eq__(self, other):
        return bytes(self) == bytes(other)

    def __hash__(self):
        return hash(bytes(self))
