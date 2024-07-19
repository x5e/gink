""" Contains the `Braid` Container class, which is primarily intended for internal use in the braid server. """
from typing import Optional, Dict, Tuple, Iterable, Union
from typeguard import typechecked

from .typedefs import GenericTimestamp, Limit, T
from .tuples import Chain
from .container import Container
from .coding import BRAID, deletion
from .muid import Muid
from .database import Database
from .bundler import Bundler


class Braid(Container):
    BEHAVIOR = BRAID

    @typechecked
    def __init__(
            self,
            muid: Optional[Union[Muid, str]] = None,
            *,
            arche: Optional[bool] = None,
            contents: Optional[Dict[Chain, Limit]] = None,
            database: Optional[Database] = None,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None,
    ):
        """
        Constructor for a braid proxy.

        muid: the global id of this container, created on the fly if None
        arche: whether this will be the global version of this container (accessible by all databases)
        contents: prefill the braid with a dict of Chain: Limit upon initialization
        database: database send bundles through, or last db instance created if None
        bundler: the bundler to add changes to, or a new one if None and immediately commits
        comment: optional comment to add to the bundler
        """
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)

        Container.__init__(
            self,
            behavior=BRAID,
            muid=muid,
            arche=arche,
            database=database,
            bundler=bundler,
        )
        if contents:
            self.clear(bundler=bundler)
            self.update(contents, bundler=bundler)

        if immediate and len(bundler):
            self._database.bundle(bundler)

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        if self._muid.medallion == -1 and self._muid.timestamp == -1:
            identifier = "arche=True"
        else:
            identifier = f"muid={self._muid!r}"
        result = f"""{self.__class__.__name__}({identifier}, contents="""
        result += "{"
        stuffing = [f"{k!r}:{v!r}" for k, v in self.items(as_of=as_of)]
        as_one_line = result + ",".join(stuffing) + "})"
        if len(as_one_line) < 80:
            return as_one_line
        result += "\n\t"
        result += ",\n\t".join(stuffing) + "})"
        return result

    def items(self, *, as_of: GenericTimestamp = None) -> Iterable[Tuple[Chain, Limit]]:
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=self.__class__.BEHAVIOR)
        for entry_pair in iterable:
            if entry_pair.builder.deletion:  # type: ignore
                continue
            muid = Muid.create(builder=entry_pair.builder.describing, context=entry_pair.address)
            value = self._get_occupant(entry_pair.builder, address=entry_pair.address)
            assert isinstance(value, (float, int))
            yield Chain(muid.medallion, muid.timestamp), value

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=self.__class__.BEHAVIOR)
        count = 0
        for thing in iterable:
            if not thing.builder.deletion:
                count += 1
        return count

    @typechecked
    def set(
            self,
            describing: Chain,
            value: Limit, *,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None
    ) -> Muid:
        return self._add_entry(key=describing, value=value, bundler=bundler, comment=comment)

    def update(
            self,
            from_what, *,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None
    ):
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment)
        if hasattr(from_what, "keys"):
            for key in from_what:
                self._add_entry(key=key, value=from_what[key], bundler=bundler)
        else:
            for key, val in from_what:
                self._add_entry(key=key, value=val, bundler=bundler)
        if immediate:
            self._database.bundle(bundler)

    @typechecked
    def delete(self, describing: Chain, *, bundler: Optional[Bundler] = None, comment: Optional[str] = None) -> Muid:
        return self._add_entry(key=describing, value=deletion, bundler=bundler, comment=comment)

    @typechecked
    def __contains__(self, thing: Chain):
        got = self.get(thing, None)
        return got is not None

    @typechecked
    def get(self, chain: Chain, /, default: T, *, as_of: GenericTimestamp = None) -> Union[T, Limit]:
        """ Gets the extent allowed for a given chain. """
        as_of = self._database.resolve_timestamp(as_of)
        key = Muid(timestamp=chain.chain_start, medallion=chain.medallion, offset=0)
        found = self._database.get_store().get_entry_by_key(self._muid, key=key, as_of=as_of)
        if found is None or found.builder.deletion:  # type: ignore
            return default
        value = self._get_occupant(found.builder, found.address)
        assert isinstance(value, (int, float))
        return value


Database.register_container_type(Braid)
