""" Contains the Vertex, EdgeType, and Edge classes (all needed for graph database functionality). """
from typing import Optional, Union, Iterable
from typeguard import typechecked

from .typedefs import GenericTimestamp, UserValue, Inclusion, MuTimestamp
from .container import Container
from .coding import EDGE_TYPE, VERTEX, inclusion, encode_value, decode_value
from .muid import Muid
from .database import Database
from .bundler import Bundler
from .builders import EntryBuilder, ChangeBuilder
from .addressable import Addressable
from .utilities import experimental


@experimental
class Vertex(Container):
    _BEHAVIOR = VERTEX

    @typechecked
    def __init__(
            self,
            *,
            muid: Optional[Union[Muid, str]] = None,
            database: Optional[Database] = None,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None,
    ):
        """
        Creates a placeholder node to contain the idea of something.

        muid: the global id of this container, created on the fly if None
        database: database send bundles through, or last db instance created if None
        bundler: the bundler to add changes to, or a new one if None and immediately commits
        comment: optional comment to add to the bundler
        """
        database = database or Database.get_most_recently_created_database()
        immediate = False
        if not isinstance(bundler, Bundler):
            immediate = True
            bundler = database.bundler(comment)
        if isinstance(muid, str):
            muid = Muid.from_str(muid)
        elif muid is None:
            muid = Container._create(VERTEX, bundler=bundler)
        assert isinstance(muid, Muid)
        assert muid.timestamp != -1 or muid.offset == VERTEX
        Container.__init__(self, muid=muid, database=database)

        if len(bundler) and immediate:
            bundler.commit()

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        _ = as_of
        return 0

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        _ = as_of
        return repr(self)

    def is_alive(self, as_of: GenericTimestamp = None) -> bool:
        """ Returns True if the vertex is alive at the given timestamp, False otherwise. """
        ts = self._database.resolve_timestamp(as_of)
        store = self._database.get_store()
        if store.get_container(self._muid) is None:
            return False
        found = store.get_entry_by_key(container=self._muid, key=None, as_of=ts)
        return (not found) or not found.builder.deletion

    def __bool__(self) -> bool:
        return self.is_alive()

    def get_edges_from(self, as_of: GenericTimestamp = None) -> Iterable['Edge']:
        """ Returns an iterable of edges that have this vertex as their source. """
        ts = self._database.resolve_timestamp(as_of)
        for found in self._database.get_store().get_edge_entries(source=self._muid, as_of=ts):
            yield Edge(muid=found.address, database=self._database, _builder=found.builder)

    def get_edges_to(self, as_of: GenericTimestamp = None) -> Iterable['Edge']:
        """ Returns an iterable of edges that have this vertex as their target. """
        ts = self._database.resolve_timestamp(as_of)
        for found in self._database.get_store().get_edge_entries(target=self._muid, as_of=ts):
            yield Edge(muid=found.address, database=self._database, _builder=found.builder)

    def remove(self, *,
               purge: bool = False,
               bundler: Optional[Bundler] = None,
               comment: Optional[str] = None) -> Muid:
        """ Marks this vertex for deletion. Optionally purges it from the database. """
        immediate = False
        if bundler is None:
            immediate = True
            bundler = self._database.bundler(comment)
        change_builder = ChangeBuilder()
        entry_builder: EntryBuilder = change_builder.entry
        entry_builder.behavior = VERTEX
        self._muid.put_into(entry_builder.container)
        entry_builder.deletion = True
        if purge:
            entry_builder.purge = True
        result = bundler.add_change(change_builder)
        if immediate:
            bundler.commit()
        return result


@experimental
class EdgeType(Container):
    _BEHAVIOR = EDGE_TYPE

    @typechecked
    def __init__(
            self,
            *,
            muid: Optional[Union[Muid, str]] = None,
            contents: Optional[Iterable['Edge']] = None,
            database: Optional[Database] = None,
            bundler: Optional[Bundler] = None,
            comment: Optional[str] = None,
    ):
        """
        Constructor for a EdgeType (otherwise known as Edge Type).

        muid: the global id of this container, created on the fly if None
        contents: prefill the EdgeType with an iterable of edges upon initialization
        database: database send bundles through, or last db instance created if None
        bundler: the bundler to add changes to, or a new one if None and immediately commits
        comment: optional comment to add to the bundler
        """
        database = database or Database.get_most_recently_created_database()
        immediate = False
        if bundler is None:
            immediate = True
            bundler = database.bundler(comment)

        if isinstance(muid, str):
            muid = Muid.from_str(muid)
        elif muid is None:
            muid = Container._create(EDGE_TYPE, bundler=bundler)
        Container.__init__(self, muid=muid, database=database)

        if contents:
            pass  # This is intentional! The edge constructors will restore them!

        if immediate and len(bundler):
            bundler.commit()

    @typechecked
    def create_edge(
        self,
        sub: Vertex,
        obj: Vertex,
        msg: Union[UserValue, Inclusion] = inclusion,
        eff: Optional[MuTimestamp] = None,
        *,
        comment: Optional[str] = None,
        bundler: Optional[Bundler] = None) -> 'Edge':
        immediate = False
        if bundler is None:
            bundler = self._database.bundler(comment)
            immediate = True
        return Edge(
            action=self,
            source=sub,
            target=obj,
            valued=msg,
            bundler=bundler,
            effective=eff,
            database=self._database,
            _immediate=immediate)

    @typechecked
    def get_edges(self, *,
                  source: Union[Vertex, Muid, None] = None,
                  target: Union[Vertex, Muid, None] = None,
                  as_of: GenericTimestamp = None) -> Iterable['Edge']:
        """ Returns an iterable of edges that match the given source and target vertices."""
        ts = self._database.resolve_timestamp(as_of)
        source = source._muid if isinstance(source, Vertex) else source
        target = target._muid if isinstance(target, Vertex) else target
        for found_entry in self._database.get_store().get_edge_entries(
                as_of=ts, edge_type=self._muid, source=source, target=target): # type: ignore
            yield Edge(muid=found_entry.address, _builder=found_entry.builder)

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        count = 0
        for _ in self.get_edges(as_of=as_of):
            count += 1
        return count

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ Dump all the edges for this edge_type. """
        identifier = f"muid={repr(self._muid)}"
        result = f"""{self.__class__.__name__}({identifier}, contents=["""
        if self.size() == 0:
            return result + "])"
        stuffing = [edge.dumps(2) for edge in self.get_edges(as_of=as_of)]
        result += "\n\n"
        result += ",\n\n".join(stuffing) + ",\n\n])"
        return result

@experimental
class Edge(Addressable):

    @typechecked
    def __init__(self,
                 muid: Union[Muid, None] = None, *,
                 action: Union[Muid, EdgeType, None] = None,
                 source: Union[Muid, Vertex, None] = None,
                 target: Union[Muid, Vertex, None] = None,
                 valued: Union[UserValue, Inclusion] = inclusion,
                 effective: Optional[MuTimestamp] = None,
                 bundler: Optional[Bundler] = None,
                 database: Optional[Database] = None,
                 _builder: Optional[EntryBuilder] = None,
                 _immediate=False):
        self._database = database or Database.get_most_recently_created_database()
        self._valued: Union[UserValue, Inclusion]
        self._effective: Optional[MuTimestamp] = None
        if action is None or source is None or target is None:
            if muid is None:
                raise ValueError("must specify muid for existing edge or edge_type, left, and rite")
            if _builder is None:
                _builder = self._database.get_store().get_entry(muid)
                if _builder is None:
                    raise ValueError("couldn't find that edge!")
            self._action = Muid.create(context=muid, builder=_builder.container)
            self._source = Muid.create(context=muid, builder=_builder.pair.left)
            self._target = Muid.create(context=muid, builder=_builder.pair.rite)
            if _builder.effective:
                self._effective = _builder.effective
            if _builder.HasField("value"):
                self._valued = decode_value(_builder.value)
            else:
                self._valued = inclusion
        else:
            if muid is not None:
                raise ValueError("can't specify source/target when reconstructing proxy edge")
            self._source = source if isinstance(source, Muid) else source._muid
            self._target = target if isinstance(target, Muid) else target._muid
            self._action = action if isinstance(action, Muid) else action._muid
            if bundler is None:
                _immediate = True
                bundler = self._database.bundler()
            change_builder = ChangeBuilder()
            entry_builder: EntryBuilder = change_builder.entry
            entry_builder.behavior = EDGE_TYPE
            self._source.put_into(entry_builder.pair.left)
            self._target.put_into(entry_builder.pair.rite)
            self._action.put_into(entry_builder.container)
            self._valued = valued
            if not isinstance(valued, Inclusion):
                encode_value(valued, entry_builder.value)
            if effective:
                entry_builder.effective = self._effective = effective
            muid = bundler.add_change(change_builder)
            if _immediate:
                bundler.commit()
        super().__init__(database=self._database, muid=muid)

    def dumps(self, indent=1) -> str:
        """ Return this edge as a string. """
        contents = []
        formatting = "\n" + "    " * indent if indent else ""
        contents.append(formatting + "source=%s" % (repr(self._source),))
        contents.append(formatting + "action=%s" % (repr(self._action),))
        contents.append(formatting + "target=%s" % (repr(self._target),))
        # load properties
        if not isinstance(self._valued, Inclusion):
            contents.append(formatting + "valued=%r" % self._valued)
        joined = ",".join(contents)
        padding = "    " * (indent - 1) if indent > 1 else ""
        return f"{padding}Edge({joined})"

    def get_action(self) -> EdgeType:
        """ Return the EdgeType that this edge is associated with. """
        return EdgeType(muid=self._action, database=self._database)

    def get_source(self) -> Vertex:
        """ Return the source vertex of this edge. """
        return Vertex(muid=self._source, database=self._database)

    def get_target(self) -> Vertex:
        """ Return the target vertex of this edge. """
        return Vertex(muid=self._target, database=self._database)

    def get_value(self) -> Union[Inclusion, UserValue]:
        return self._valued

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}('{self._muid}')"

    def get_effective(self) -> Optional[MuTimestamp]:
        """ Return the effective timestamp of this edge. """
        effective = self._effective or self._muid.timestamp
        return effective

    def remove(self, *,
                purge: bool = False,
                bundler: Optional[Bundler] = None,
                comment: Optional[str] = None) -> Muid:
        return self.move(purge=purge, bundler=bundler, comment=comment, dest=None)

    def move(self, *,
               dest: Optional[MuTimestamp] = None,
               purge: bool = False,
               bundler: Optional[Bundler] = None,
               comment: Optional[str] = None) -> Muid:
        """ Move this edge to a new timestamp.
            Returns the muid of the change.
        """
        immediate = False
        if not isinstance(bundler, Bundler):
            bundler = self._database.bundler(comment)
            immediate = True
        change_builder = ChangeBuilder()
        movement_builder = change_builder.movement
        container_muid = self._action
        container_muid.put_into(movement_builder.container)
        self._muid.put_into(movement_builder.entry)
        if dest:
            movement_builder.dest = dest
        if purge is True:
            movement_builder.purge = purge
        change_muid = bundler.add_change(change_builder)
        if immediate:
            bundler.commit()
        return change_muid
