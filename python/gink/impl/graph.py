""" Contains the Noun, Verb, and Edge classes (all needed for graph database functionality). """
from __future__ import annotations
from typing import Optional, Union, Iterable

from .muid import Muid

from .typedefs import GenericTimestamp, UserValue, Inclusion
from .container import Container
from .coding import VERB, NOUN, inclusion, encode_value, decode_value
from .muid import Muid
from .database import Database
from .bundler import Bundler
from .builders import EntryBuilder, ChangeBuilder
from .addressable import Addressable

class Noun(Container):
    BEHAVIOR = NOUN

    def __init__(self, *,
                 root: bool=False,
                 muid: Optional[Muid]=None,
                 database: Optional[Database]=None):
        """
        Creates a placeholder node to contain the idea of something.

        muid: the global id of this directory, created on the fly if None
        db: database send commits through, or last db instance created if None
        """
        database = database or Database.get_last()
        bundler = Bundler()
        if root:
            muid = Muid(-1, -1, NOUN)
        if muid is None:
            muid = Container._create(NOUN, database=database, bundler=bundler)
        Container.__init__(self, muid=muid, database=database)
        if len(bundler):
            self._database.commit(bundler)

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        _ = as_of
        return 0

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        _ = as_of
        return repr(self)

    def is_alive(self, as_of: GenericTimestamp = None) -> bool:
        ts = self._database.resolve_timestamp(as_of)
        store = self._database.get_store()
        if store.get_container(self._muid) is None:
            return False
        found = store.get_entry_by_key(container=self._muid, key=None, as_of=ts)
        return (not found) or not found.builder.deletion

    def __bool__(self) -> bool:
        return self.is_alive()

    def remove(self, *,
               purge: bool = False,
               bundler: Optional[Bundler] = None,
               comment: Optional[str] = None) -> Muid:
        immediate = False
        if bundler is None:
            immediate = True
            bundler = Bundler(comment=comment)
        change_builder = ChangeBuilder()
        entry_builder: EntryBuilder = change_builder.entry
        entry_builder.behavior = NOUN
        self._muid.put_into(entry_builder.container)
        entry_builder.deletion = True
        if purge:
            entry_builder.purge = True
        result = bundler.add_change(change_builder)
        if immediate:
            self._database.commit(bundler)
        return result

class Verb(Container):
    BEHAVIOR = VERB

    def __init__(self, *,
                 root=False,
                 muid: Optional[Muid] = None,
                 database: Optional[Database]=None,
                 contents: Optional[Iterable[Edge]] = None):
        database = database or Database.get_last()
        bundler = Bundler()
        if root:
            muid = Muid(-1, -1, VERB)
        if muid is None:
            muid = Container._create(VERB, database=database, bundler=bundler)
        Container.__init__(self, muid=muid, database=database)
        if contents:
            pass # This is intentional! The edge constructors will restore them!
        if len(bundler):
            self._database.commit(bundler)

    def create_edge(self, sub: Noun, obj: Noun, msg: Union[UserValue, Inclusion] = inclusion,
                    comment: Optional[str] = None, bundler: Optional[Bundler] = None) -> Edge:
        immediate = False
        if bundler is None:
            bundler = Bundler(comment)
            immediate = True
        return Edge(
            action=self,
            source=sub,
            target=obj,
            valued=msg,
            database=self._database,
            _immediate = immediate)

    def get_edges(self, *,
                  source: Union[Noun, Muid, None] = None,
                  target: Union[Noun, Muid, None] = None,
                  as_of: GenericTimestamp = None) -> Iterable[Edge]:
        ts = self._database.resolve_timestamp(as_of)
        source = source._muid if isinstance(source, Noun) else source
        target = target._muid if isinstance(target, Noun) else target
        for found_entry in self._database.get_store().get_edge_entries(
            ts, verb=self._muid, source=source, target=target):
            yield Edge(muid=found_entry.address, _builder=found_entry.builder)

    def size(self, *, as_of: GenericTimestamp = None) -> int:
        count = 0
        for _ in self.get_edges(as_of=as_of):
            count += 1
        return count

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ Dump all of the edges for this verb.
        """
        if self._muid.medallion == -1 and self._muid.timestamp == -1:
            identifier = "root=True"
        else:
            identifier = repr(str(self._muid))
        result = f"""{self.__class__.__name__}({identifier}, contents=["""
        if self.size() == 0:
            return result + "])"
        stuffing = [edge.dumps(2) for edge in self.get_edges(as_of=as_of)]
        result += "\n\n"
        result += ",\n\n".join(stuffing) + ",\n\n])"
        return result

class Edge(Addressable):

    def dumps(self, indent=1) -> str:
        contents = []
        formatting = "\n" + "    " * indent if indent else ""
        contents.append((" " if indent else "")+"muid='%s'" % (self._muid,))
        contents.append(formatting + "source='%s'" % (self._source,))
        contents.append(formatting + "action='%s'" % (self._action,))
        contents.append(formatting + "target='%s'" % (self._target,))
        if not isinstance(self._valued, Inclusion):
            contents.append(formatting + "valued=%r" % self._valued)
        joined = ",".join(contents)
        padding = "    " * (indent - 1) if indent > 1 else ""
        return f"{padding}Edge({joined})"

    def get_action(self) -> Verb:
        return Verb(muid=self._action, database=self._database)

    def get_source(self) -> Noun:
        return Noun(muid=self._source, database=self._database)

    def get_target(self) -> Noun:
        return Noun(muid=self._target, database=self._database)

    def _get_container(self) -> Muid:
        return self._action

    def __init__(self, muid: Union[Muid, None] = None, *,
                 action: Union[Muid, Verb, None] = None,
                 source: Union[Muid, Noun, None] = None,
                 target: Union[Muid, Noun, None] = None,
                 valued: Union[UserValue, Inclusion] = inclusion,
                 bundler: Optional[Bundler] = None,
                 database: Optional[Database] = None,
                 _builder: Optional[EntryBuilder] = None,
                 _immediate = False):
        self._database = database or Database.get_last()
        self._valued: Union[UserValue, Inclusion]
        self._muid: Muid
        if action is None or source is None or target is None:
            if muid is None:
                raise ValueError("must specify muid for existing edge or verb, left, and rite")
            self._muid = muid
            if _builder is None:
                _builder = self._database.get_store().get_entry(self._muid)
                if _builder is None:
                    raise ValueError("couldn't find that edge!")
            self._action = Muid.create(context=self._muid, builder=_builder.container)
            self._source = Muid.create(context=self._muid, builder=_builder.pair.left)
            self._target = Muid.create(context=self._muid, builder=_builder.pair.rite)
            if _builder.HasField("value"):
                self._valued = decode_value(_builder.value)
            else:
                self._valued = inclusion
        else:
            self._source = source if isinstance(source, Muid) else source._muid
            self._target = target if isinstance(target, Muid) else target._muid
            self._action = action if isinstance(action, Muid) else action._muid
            if bundler is None:
                _immediate = True
                bundler = Bundler()
            change_builder = ChangeBuilder()
            entry_builder: EntryBuilder = change_builder.entry
            entry_builder.behavior = VERB
            self._source.put_into(entry_builder.pair.left)
            self._target.put_into(entry_builder.pair.rite)
            self._action.put_into(entry_builder.container)
            self._valued = valued
            if not isinstance(valued, Inclusion):
                encode_value(valued, entry_builder.value)
            if muid is None:
                self._muid = bundler.add_change(change_builder)
            else:
                self._muid = muid
                muid.put_into(change_builder.restore)
            if _immediate:
                self._database.commit(bundler)

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}('{self._muid}')"

    def remove(self, *,
               purge: bool = False,
               bundler: Optional[Bundler] = None,
               comment: Optional[str] = None) -> Muid:
        immediate = False
        if not isinstance(bundler, Bundler):
            bundler = Bundler(comment=comment)
            immediate = True
        change_builder = ChangeBuilder()
        movement_builder = change_builder.movement
        container_muid = self._action
        container_muid.put_into(movement_builder.container)
        self._muid.put_into(movement_builder.entry)
        if purge is True:
            movement_builder.purge = purge
        change_muid = bundler.add_change(change_builder)
        if immediate:
            self._database.commit(bundler)
        return change_muid
