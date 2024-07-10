""" Contains the `Group` Container class. """
from __future__ import annotations
from typing import Optional, Union, Set, Iterable

from .typedefs import GenericTimestamp
from .container import Container
from .coding import deletion, inclusion
from .muid import Muid
from .database import Database
from .bundler import Bundler
from .builders import Behavior


class Group(Container):
    BEHAVIOR = Behavior.GROUP

    def __init__(self, *, contents: Optional[Set[Union[Muid, Container]]] = None,
                 muid: Optional[Muid] = None, database=None):
        """
        Constructor for a group definition.

        muid: the global id of this directory, created on the fly if None
        db: database send bundles through, or last db instance created if None
        """
        database = database or Database.get_last()
        bundler = Bundler()
        if muid is None:
            muid = Container._create(Behavior.GROUP, database=database, bundler=bundler)
        Container.__init__(self, muid=muid, database=database)
        if contents:
            raise NotImplementedError()
        if len(bundler):
            self._database.bundle(bundler)

    def include(self, what: Union[Muid, Container], *,
                bundler: Optional[Bundler] = None, comment: Optional[str] = None):
        if isinstance(what, Container):
            what = what._muid
        return self._add_entry(key=what, value=inclusion, bundler=bundler, comment=comment)

    def exclude(self, what: Union[Muid, Container], *,
                bundler: Optional[Bundler] = None, comment: Optional[str] = None):
        if isinstance(what, Container):
            what = what._muid
        return self._add_entry(key=what, value=deletion, bundler=bundler, comment=comment)

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ Dumps the contents of this group to a string.
        """
        identifier = repr(str(self._muid))
        result = f"""{self.__class__.__name__}({identifier}, contents="""
        result += "{"
        stuffing = [repr(_) for _ in self.get_member_ids(as_of=as_of)]
        as_one_line = result + ",".join(stuffing) + "})"
        if len(as_one_line) < 80:
            return as_one_line
        result += "\n\t"
        result += ",\n\t".join(stuffing) + "})"
        return result

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        ts = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=ts, behavior=Behavior.GROUP)
        count = 0
        for entry_pair in iterable:
            if not entry_pair.builder.deletion:
                count += 1
        return count

    def __len__(self):
        return self.size()

    def __iter__(self) -> Iterable[Container]:
        for thing in self.get_members():
            yield thing

    def __contains__(self, thing: Union[Muid, Container]) -> bool:
        return self.contains(thing)

    def get_member_ids(self, *, as_of: GenericTimestamp = None) -> Iterable[Muid]:
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=Behavior.GROUP)
        for entry_pair in iterable:
            if entry_pair.builder.deletion:  # type: ignore
                continue
            yield Muid.create(builder=entry_pair.builder.describing, context=entry_pair.address)

    def get_members(self, *, as_of: GenericTimestamp = None) -> Set[Container]:
        """ Returns pairs of (muid, contents) for the sequence at the given time.
        """
        return {self._database.get_container(muid) for muid in self.get_member_ids(as_of=as_of)}

    def contains(self, what: Union[Muid, Container], *, as_of: GenericTimestamp = None) -> bool:
        ts = self._database.resolve_timestamp(as_of)
        if isinstance(what, Container):
            what = what._muid
        found = self._database.get_store().get_entry_by_key(self.get_muid(), key=what, as_of=ts)
        return bool(found and not found.builder.deletion)


Database.register_container_type(Group)
