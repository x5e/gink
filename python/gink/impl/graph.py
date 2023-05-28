""" Contains the Noun, Verb, and Edge classes (all needed for graph database functionality). """
from __future__ import annotations
from typing import Optional, Union, Iterable

from .typedefs import GenericTimestamp, UserValue, Inclusion
from .container import Container
from .coding import VERB, NOUN, inclusion, encode_value, decode_value
from .muid import Muid
from .database import Database
from .bundler import Bundler
from .builders import EntryBuilder, ChangeBuilder


class Noun(Container):
    BEHAVIOR = NOUN

    def __init__(self, *, root=False, muid: Optional[Muid] = None, database=None):
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

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        _ = as_of
        return repr(self)


class Verb(Container):
    BEHAVIOR = VERB

    def __init__(self, *, root=False, muid: Optional[Muid] = None, database: Optional[Database]=None,
                 contents: Optional[Iterable[Edge]] = None):
        database = database or Database.get_last()
        bundler = Bundler()
        if root:
            muid = Muid(-1, -1, VERB)
        if muid is None:
            muid = Container._create(VERB, database=database, bundler=bundler)
        Container.__init__(self, muid=muid, database=database)
        if contents:
            pass # This is intentional! The Edge constructor will restore it!
        if len(bundler):
            self._database.commit(bundler)

    def create_edge(self, sub: Noun, obj: Noun, msg: Optional[UserValue] = None,
                    comment: Optional[str] = None, bundler: Optional[Bundler] = None) -> Edge:
        immediate = False
        if bundler is None:
            bundler = Bundler(comment)
            immediate = True
        return Edge(
            verb=self,
            left=sub,
            rite=obj,
            value=msg,
            database=self._database,
            _immediate = immediate)

    def get_edges(self, *, sub: Union[Noun, Muid, None] = None, obj: Union[Noun, Muid, None] = None,
                  as_of: GenericTimestamp = None) -> Iterable[Edge]:
        ts = self._database.resolve_timestamp(as_of)
        sub = sub._muid if isinstance(sub, Noun) else sub
        obj = obj._muid if isinstance(obj, Noun) else obj
        for found_entry in self._database.get_store().get_edge_entries(ts, verb=self._muid, sub=sub, obj=obj):
            yield Edge(muid=found_entry.address, _builder=found_entry.builder)

    def dumps(self, as_of: GenericTimestamp = None) -> str:
        """ Dump all of the edges for this verb.
        """
        if self._muid.medallion == -1 and self._muid.timestamp == -1:
            identifier = "root=True"
        else:
            identifier = repr(str(self._muid))
        result = f"""{self.__class__.__name__}({identifier}, contents="""
        result += "["
        stuffing = [edge.dumps() for edge in self.get_edges(as_of=as_of)]
        as_one_line = result + ",".join(stuffing) + "])"
        if len(as_one_line) < 80:
            return as_one_line
        result += "\n\t"
        result += ",\n\t".join(stuffing) + "})"
        return result


class Edge:

    def dumps(self) -> str:
        contents = []
        contents.append("muid=" + repr(self._muid))
        contents.append("verb=%r" % self._verb)
        contents.append("left=%r" % self._left)
        contents.append("rite=%r" % self._rite)
        if not isinstance(self._value, Inclusion):
            contents.append("value=%r" % self._value)
        joined = ", ".join(contents)
        return f"Edge({joined})"

    def __init__(self, *,
                 muid: Union[Muid, None] = None,
                 verb: Union[Muid, Verb, None] = None,
                 left: Union[Muid, Noun, None] = None,
                 rite: Union[Muid, Noun, None] = None,
                 value: Union[UserValue, Inclusion] = inclusion,
                 bundler: Optional[Bundler] = None,
                 database: Optional[Database] = None,
                 _builder: Optional[EntryBuilder] = None,
                 _immediate = False):
        self._database = database or Database.get_last()
        self._value: Union[UserValue, Inclusion]
        self._muid: Muid
        if verb is None or left is None or rite is None:
            if muid is None:
                raise ValueError("must specify muid for existing edge or verb, left, and rite")
            self._muid = muid
            if _builder is None:
                ts = self._database.get_now()
                _builder = self._database.get_store().get_entry(self._muid, as_of=ts)
                if _builder is None:
                    raise ValueError("couldn't find that edge!")
            self._verb = _builder.container
            self._left = Muid.create(context=self._muid, builder=_builder.pair.left)
            self._rite = Muid.create(context=self._muid, builder=_builder.pair.rite)
            if _builder.HasField("value"):
                self._value = decode_value(_builder.value)
            else:
                self._value = inclusion
        else:
            self._left = left = left if isinstance(left, Muid) else left._muid
            self._rite = rite if isinstance(rite, Muid) else rite._muid
            self._verb = verb if isinstance(verb, Muid) else verb._muid
            if bundler is None:
                _immediate = True
                bundler = Bundler()
            change_builder = ChangeBuilder()
            entry_builder: EntryBuilder = change_builder.entry
            entry_builder.behavior = VERB
            self._left.put_into(entry_builder.pair.left)
            self._rite.put_into(entry_builder.pair.rite)
            self._verb.put_into(entry_builder.container)
            self._value = value
            if not isinstance(value, Inclusion):
                encode_value(value, entry_builder.value)
            if muid is None:
                self._muid = bundler.add_change(change_builder)
            else:
                self._muid = muid
                muid.put_into(change_builder.restore)
            if _immediate:
                self._database.commit(bundler)

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(muid='{self._muid}')"
