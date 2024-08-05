""" Contains the `Group` Container class. """
from typing import Optional, Union, Set, Iterable, Dict
from typeguard import typechecked

from .typedefs import GenericTimestamp
from .container import Container
from .coding import deletion, inclusion, GROUP
from .muid import Muid
from .database import Database
from .bundler import Bundler
from .builders import Behavior


class Group(Container):
    BEHAVIOR = Behavior.GROUP

    @typechecked
    def __init__(
                self,
                muid: Optional[Union[Muid, str]] = None,
                *,
                contents: Optional[Dict[str, Iterable[Union[Muid, Container]]]] = None,
                database: Optional[Database] = None,
                bundler: Optional[Bundler] = None,
                comment: Optional[str] = None,
            ):
        """
        Constructor for a group definition.

        muid: the global id of this container, created on the fly if None
        contents: optionally expecting a dictionary of {"include": Set, "exclude": Set} to prefill the group
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
                behavior=GROUP,
                muid=muid,
                arche=False,
                database=database,
                bundler=bundler,
            )

        if contents:
            assert contents.keys() <= {"include", "exclude"}, "expecting only 'include' and 'exclude' keys in contents"
            self.clear(bundler=bundler)
            included = contents.get("include", set())
            assert isinstance(included, Iterable)
            for container in included:
                self.include(container, bundler=bundler)

            excluded = contents.get("exclude", set())
            assert isinstance(excluded, Iterable)
            for container in excluded:
                self.exclude(container, bundler=bundler)

        if immediate and len(bundler):
            self._database.bundle(bundler)

    @typechecked
    def include(self, what: Union[Muid, Container], *,
                bundler: Optional[Bundler] = None, comment: Optional[str] = None):
        if isinstance(what, Container):
            what = what._muid
        if not hasattr(what, "timestamp"):
            raise TypeError("Can only include a container or muid into a group.")
        return self._add_entry(key=what, value=inclusion, bundler=bundler, comment=comment)

    @typechecked
    def exclude(self, what: Union[Muid, Container], *,
                bundler: Optional[Bundler] = None, comment: Optional[str] = None):
        if isinstance(what, Container):
            what = what._muid
        if not hasattr(what, "timestamp"):
            raise TypeError("Can only exclude a container or muid from a group.")
        return self._add_entry(key=what, value=deletion, bundler=bundler, comment=comment)

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ Dumps the contents of this group to a string.
        """
        ts = self._database.resolve_timestamp(as_of)
        identifier = f"muid={self._muid!r}"
        result = f"""{self.__class__.__name__}({identifier}, contents="""
        result += "{"
        included_stuffing = "\n\t'include': [\n\t"
        excluded_stuffing = "\n\t'exclude': [\n\t"

        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=ts, behavior=Behavior.GROUP)
        for entry_pair in iterable:
            mb = entry_pair.builder.describing
            if not entry_pair.builder.deletion:
                included_stuffing += f"Muid({mb.timestamp}, {mb.medallion}, {mb.offset})" + ",\n\t"
            else:
                excluded_stuffing += f"Muid({mb.timestamp}, {mb.medallion}, {mb.offset})" + ",\n\t"

        if included_stuffing != "\n\t'include': [\n\t":
            result += "".join(included_stuffing) + "],"
        if excluded_stuffing != "\n\t'exclude': [\n\t":
            result += "".join(excluded_stuffing) + "],"

        result += "})"
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

    def __len__(self) -> int:
        return self.size()

    def __iter__(self) -> Iterable[Container]:
        for thing in self.get_members():
            yield thing

    @typechecked
    def __contains__(self, what: Union[Muid, Container]) -> bool:
        return self.contains(what)

    def get_member_ids(self, *, excluded: bool = False, as_of: GenericTimestamp = None) -> Iterable[Muid]:
        as_of = self._database.resolve_timestamp(as_of)
        iterable = self._database.get_store().get_keyed_entries(
            container=self._muid, as_of=as_of, behavior=Behavior.GROUP)
        for entry_pair in iterable:
            if excluded == entry_pair.builder.deletion:  # type: ignore
                yield Muid.create(builder=entry_pair.builder.describing, context=entry_pair.address)

    def get_members(self, *, excluded: bool = False, as_of: GenericTimestamp = None) -> Set[Container]:
        """ Returns a set of containers included/excluded in the group at the given time. """
        return {self._database.get_container(muid) for muid in self.get_member_ids(excluded=excluded, as_of=as_of)}

    @typechecked
    def contains(self, what: Union[Muid, Container], *, as_of: GenericTimestamp = None) -> bool:
        ts = self._database.resolve_timestamp(as_of)
        if isinstance(what, Container):
            what = what._muid
            assert what.timestamp, "this container has not been bundled" # type: ignore
        muid = self.get_muid()
        assert muid.timestamp, "this group has not been bundled"
        found = self._database.get_store().get_entry_by_key(muid, key=what, as_of=ts) # type: ignore
        return bool(found and not found.builder.deletion)


Database.register_container_type(Group)
