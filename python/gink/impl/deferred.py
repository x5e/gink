from .muid import Muid


class Deferred(Muid):
    """ Version of a muid that references a bundle.

        We need a custom subclass here because we want to return something that can
        be used as a muid, but we don't have the timestamp and medallion set until
        the bundle has been sealed.  This class allows us to return an address object
        that will give "None" when asked for timestamp/medallion before the bundle
        has been sealed, and the appropriate values after sealing.
    """

    def __new__(cls, offset: int, bundler):
        assert bundler is not None
        return super().__new__(cls, 0, 0, offset)

    def __init__(self, offset: int, bundler) -> None:
        super().__init__()
        assert offset != 0
        self._bundler = bundler

    def __getattribute__(self, name):
        if name == "timestamp":
            return getattr(self._bundler, "timestamp")
        if name == "medallion":
            return getattr(self._bundler, "medallion")
        return object.__getattribute__(self, name)

    def __hash__(self):
        return hash((self.offset, self.medallion, self.timestamp))

    def __eq__(self, other):
        if not isinstance(other, Muid):
            return False
        return ((self.offset, self.medallion, self.timestamp)  # type: ignore
                == (other.offset, other.medallion, other.timestamp))  # type: ignore

    def __ne__(self, other):
        return not self.__eq__(other)
