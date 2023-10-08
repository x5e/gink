""" Contains the Noun, Verb, and Edge classes (all needed for graph database functionality). """
from __future__ import annotations
from typing import Optional, Union, Iterable

from py2neo.cypher.lexer import CypherLexer
from pygments.token import Keyword, Name, Punctuation, Text, Operator

from .typedefs import GenericTimestamp, UserValue, Inclusion
from .container import Container
from .coding import VERB, NOUN, inclusion, encode_value, decode_value
from .muid import Muid
from .database import Database
from .bundler import Bundler
from .builders import EntryBuilder, ChangeBuilder
from .addressable import Addressable
from .cypher_builder import *


class Noun(Container):
    BEHAVIOR = NOUN

    def __init__(self, *,
                 root: bool = False,
                 muid: Optional[Muid] = None,
                 bundler: Optional[Bundler] = None,
                 database: Optional[Database] = None):
        """
        Creates a placeholder node to contain the idea of something.

        muid: the global id of this noun, created on the fly if None
        db: database send commits through, or last db instance created if None
        """
        database = database or Database.get_last()
        immediate = False
        if not isinstance(bundler, Bundler):
            immediate = True
            bundler = Bundler()
        if root:
            muid = Muid(-1, -1, NOUN)
        if muid is None:
            muid = Container._create(NOUN, database=database, bundler=bundler)
        Container.__init__(self, muid=muid, database=database)
        if len(bundler) and immediate:
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

    def get_edges_from(self, as_of: GenericTimestamp = None) -> Iterable[Edge]:
        ts = self._database.resolve_timestamp(as_of)
        for found in self._database.get_store().get_edge_entries(source=self._muid, as_of=ts):
            yield Edge(muid=found.address, database=self._database, _builder=found.builder)

    def get_edges_to(self, as_of: GenericTimestamp = None) -> Iterable[Edge]:
        ts = self._database.resolve_timestamp(as_of)
        for found in self._database.get_store().get_edge_entries(target=self._muid, as_of=ts):
            yield Edge(muid=found.address, database=self._database, _builder=found.builder)

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
                 database: Optional[Database] = None,
                 contents: Optional[Iterable[Edge]] = None):
        database = database or Database.get_last()
        bundler = Bundler()
        if root:
            muid = Muid(-1, -1, VERB)
        if muid is None:
            muid = Container._create(VERB, database=database, bundler=bundler)
        Container.__init__(self, muid=muid, database=database)
        if contents:
            pass  # This is intentional! The edge constructors will restore them!
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
            bundler=bundler,
            database=self._database,
            _immediate=immediate)

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
        """ Dump all the edges for this verb.
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

    def __init__(self,
                 muid: Union[Muid, None] = None, *,
                 action: Union[Muid, Verb, None] = None,
                 source: Union[Muid, Noun, None] = None,
                 target: Union[Muid, Noun, None] = None,
                 valued: Union[UserValue, Inclusion] = inclusion,
                 bundler: Optional[Bundler] = None,
                 database: Optional[Database] = None,
                 _builder: Optional[EntryBuilder] = None,
                 _immediate=False):
        database = database or Database.get_last()
        self._valued: Union[UserValue, Inclusion]
        if action is None or source is None or target is None:
            if muid is None:
                raise ValueError("must specify muid for existing edge or verb, left, and rite")
            if _builder is None:
                _builder = self._database.get_store().get_entry(muid)
                if _builder is None:
                    raise ValueError("couldn't find that edge!")
            self._action = Muid.create(context=muid, builder=_builder.container)
            self._source = Muid.create(context=muid, builder=_builder.pair.left)
            self._target = Muid.create(context=muid, builder=_builder.pair.rite)
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
                muid = bundler.add_change(change_builder)
            else:
                muid.put_into(change_builder.restore)
            if _immediate:
                database.commit(bundler)
        super().__init__(database=database, muid=muid)

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

class Graph():
    """
    Intended to house all of the graph query stuff
    """
    def __init__(self, database: Union[Database, None] = None):
        if not database:
            self.database = Database.get_last()
        self.database = database
        self.lexer = CypherLexer()
        self.lexer.add_filter("whitespace")

    def query(self, query: str):
        tokens = self.lexer.get_tokens(query)
        cypher_builder = self.parse_tokens(tokens)
        # Obviously not done, just first step
        return cypher_builder

    def execute_cypher(self, cypher_builder: CypherBuilder):
        store = self.database.get_store()
        containers = list(store.get_all_containers(behaviors=[NOUN, VERB]))

    def parse_tokens(self, tokens: Iterable, cypher_builder: CypherBuilder | None = None) -> CypherBuilder:
        """
        Iterates through the tokens created by the CypherLexer, and builds a CypherBuilder filled with
        the clauses and data in the query.
        """
        if not cypher_builder:
            cypher_builder = CypherBuilder()
        # TODO: figure out the best way to check for Cypher syntax errors
        # here is a parser in scala: https://github.com/outr/neo4akka/blob/master/src/main/scala/com/outr/neo4akka/Macros.scala#L32

        # TODO: There is still a ton more to do here in terms of handling clauses and stuff.

        # I want this method to recurse for every keyword, so this is how I'm keeping track.
        is_keyword = False
        # Make tokens generator subscriptable and remove whitespace.
        tokens = [token for token in tokens if token[0] != Text.Whitespace]
        # If the method is working properly, the first item of the list should be the keyword to analyze.
        first_keyword = tokens[0][1].upper()

        # Initializing hash tables based on the keywords encountered
        if first_keyword == "MATCH":
            cypher_match = CypherMatch()
            cypher_builder.match = cypher_match

        elif first_keyword == "CREATE":
            cypher_create = CypherCreate()
            cypher_builder.create = cypher_create

        # Using this current_clause variable to shorten the code, since these
        # three keywords all operate in very similar ways
        elif first_keyword in ("WHERE", "AND", "OR"):
            if cypher_builder.where:
                    cypher_where = cypher_builder.where
            else:
                cypher_where = CypherWhere()
                cypher_builder.where = cypher_where
            if first_keyword == "WHERE":
                current_clause = cypher_where
            elif first_keyword == "AND":
                current_clause = CypherWhere()
                cypher_where.and_.append(current_clause)
            elif first_keyword == "OR":
                current_clause = CypherWhere()
                cypher_where.or_.append(current_clause)

        elif first_keyword == "SET":
            cypher_set = CypherSet()
            cypher_builder.set.append(cypher_set)

        elif first_keyword == "DELETE":
            cypher_delete = CypherDelete()
            cypher_builder.delete = cypher_delete

        elif first_keyword == "RETURN":
            cypher_return = CypherReturn()
            cypher_builder.return_ = cypher_return

        # When we encounter a -[]->, we need to treat the variable differently.
        is_relationship = False
        # This variable is to let the loop know we are in the final connected node of -[]->()
        is_connected = False
        # determining whether the Name.Variable token is actually a variable or a property
        in_properties = False

        i = 0
        while not is_keyword:
            try:
                current_token = tokens[i]
            except IndexError:
                break

            # Marking where we are in the query
            if current_token[0] == Punctuation and "[" in current_token[1]:
                    is_relationship = True
            elif current_token[0] == Punctuation and "]" in current_token[1]:
                # Done with relationship, moving on to connected node.
                is_relationship = False
                is_connected = True
            elif current_token[0] == Punctuation and "{" in current_token[1]:
                in_properties = True
            elif current_token[0] == Punctuation and "}" in current_token[1]:
                in_properties = False

            print(current_token)
            if first_keyword == "MATCH":
                # First node in a node-rel-node sequence
                if not is_relationship and not is_connected:
                    if current_token[0] == Name.Variable:
                        node = CypherNode()
                        cypher_match.root_nodes.add(node)
                        node.variable = current_token[1]

                    elif current_token[0] == Name.Label:
                        last_var = tokens[i-2][1] if tokens[i-2][0] == Name.Variable else None
                        # If the query includes a variable, add the label to the node we just created
                        if last_var:
                            node.label = current_token[1]
                        # Otherwise, we need to create the node here without a variable.
                        else:
                            node = CypherNode()
                            # Remember this node specifically when we reach the end of (node)-[rel]-(node)
                            cypher_match.root_nodes.add(node)
                            node.label = current_token[1]

                elif is_relationship and not is_connected:
                    if current_token[0] == Name.Variable:
                        # Node still refers to the variable declared above, since a relationship has to
                        # create a node first.
                        rel = CypherRel()
                        node.rel = rel
                        rel.var = current_token[1]
                        rel.previous_node = node

                    elif current_token[0] == Name.Label:
                        last_var = tokens[i-2][1] if tokens[i-2][0] == Name.Variable else None
                        if last_var and rel:
                            rel.label = current_token[1]
                        else:
                            rel = CypherRel()
                            node.rel = rel
                            rel.label = current_token[1]
                            rel.previous_node = node

                elif is_connected and not is_relationship:
                    if current_token[0] == Name.Variable:
                        node = CypherNode()
                        rel.next_node = node
                        cypher_match.root_nodes.add(node)
                        node.variable = current_token[1]

                    elif current_token[0] == Name.Label:
                        last_var = tokens[i-2][1] if tokens[i-2][0] == Name.Variable else None
                        # If the query includes a variable, add the label to the node we just created
                        if last_var:
                            node.label = current_token[1]
                        # Otherwise, we need to create the node here without a variable.
                        else:
                            node = CypherNode()
                            rel.next_node = node
                            node.label = current_token[1]

            elif first_keyword == "CREATE":
                # First node in a node-rel-node sequence
                if not is_relationship and not is_connected:
                    if current_token[0] == Name.Variable and not in_properties:
                        node = CypherNode()
                        cypher_create.root_nodes.add(node)
                        node.variable = current_token[1]

                    elif current_token[0] == Name.Variable and in_properties:
                        current_property = current_token[1]
                        node.properties[current_property] = None

                    # If the second to last token was a variable and we are in properties,
                    # it should be safe to assume this is a value, since properties follow
                    # {property1: 'value1'}
                    elif tokens[i-2][0] == Name.Variable and in_properties:
                        # TODO: figure out how to properly handle quotes.
                        node.properties[current_property] = current_token[1]

                    elif current_token[0] == Name.Label:
                        last_var = tokens[i-2][1] if tokens[i-2][0] == Name.Variable else None
                        # If the query includes a variable, add the label to the node we just created
                        if last_var:
                            node.label = current_token[1]
                        # Otherwise, we need to create the node here without a variable.
                        else:
                            node = CypherNode()
                            # Remember this node specifically when we reach the end of (node)-[rel]-(node)
                            cypher_match.root_nodes.add(node)
                            node.label = current_token[1]

                elif is_relationship and not is_connected:
                    if current_token[0] == Name.Variable:
                        # Node still refers to the variable declared above, since a relationship has to
                        # create a node first.
                        rel = CypherRel()
                        node.rel = rel
                        rel.var = current_token[1]
                        rel.previous_node = node

                    elif current_token[0] == Name.Label:
                        last_var = tokens[i-2][1] if tokens[i-2][0] == Name.Variable else None
                        if last_var and rel:
                            rel.label = current_token[1]
                        else:
                            rel = CypherRel()
                            node.rel = rel
                            rel.label = current_token[1]
                            rel.previous_node = node

                elif is_connected and not is_relationship:
                    if current_token[0] == Name.Variable and not in_properties:
                        node = CypherNode()
                        rel.next_node = node
                        node.variable = current_token[1]

                    elif current_token[0] == Name.Variable and in_properties:
                        current_property = current_token[1]
                        node.properties[current_property] = None

                    # If the second to last token was a variable and we are in properties,
                    # it should be safe to assume this is a value, since properties follow
                    # {property1: 'value1'}
                    elif tokens[i-2][0] == Name.Variable and in_properties:
                        # TODO: figure out how to properly handle quotes for property values.
                        node.properties[current_property] = current_token[1]

                    elif current_token[0] == Name.Label:
                        last_var = tokens[i-2][1] if tokens[i-2][0] == Name.Variable else None
                        # If the query includes a variable, add the label to the node we just created
                        if last_var:
                            node.label = current_token[1]
                        # Otherwise, we need to create the node here without a variable.
                        else:
                            node = CypherNode()
                            rel.next_node = node
                            node.label = current_token[1]

            elif first_keyword == "SET":
                # SET clauses are pretty simple - SET var.property operator value
                if tokens[i-1][1] == "." and current_token[0] == Name.Variable:
                        cypher_set.property = current_token[1]
                elif current_token[0] == Name.Variable:
                    cypher_set.variable = current_token[1]
                elif current_token[0] == Operator and not current_token[1] == ".":
                    cypher_set.operator = current_token[1]
                elif tokens[i-1][0] == Operator and not tokens[i-1][1] == ".":
                    cypher_set.value = current_token[1]

            # WHERE AND and OR are basically the same. The difficult part comes with
            # trying to organize the classes to where it makes sense to loop through
            # and check the conditions.
            elif first_keyword in ("WHERE", "AND", "OR"):
                if tokens[i-1][1] == "." and current_token[0] == Name.Variable:
                        current_clause.property = current_token[1]
                elif current_token[0] == Name.Variable:
                    current_clause.variable = current_token[1]
                elif current_token[0] == Operator and not current_token[1] == ".":
                    current_clause.operator = current_token[1]
                elif tokens[i-1][0] == Operator and not tokens[i-1][1] == ".":
                    current_clause.value = current_token[1]

            elif first_keyword == "RETURN":
                if current_token[0] == Name.Variable:
                    cypher_return.returning.append(current_token[1])

            elif first_keyword == "DELETE":
                if current_token[0] == Name.Variable:
                    cypher_delete.deleting.append(current_token[1])

            # Stop the loop if the next token is a keyword.
            try:
                next_token = tokens[i+1]
                # Treating AND as a keyword that will work similar to WHERE
                if next_token[0] == Keyword or next_token[1].upper() == "AND" or next_token[1].upper() == "OR":
                    is_keyword = True
            except IndexError:
                next_token = None

            i += 1

        # Recurse with the remainder of the unparsed tokens, if there is anything left to parse.
        if len(tokens) > 1 and next_token:
            self.parse_tokens(tokens=tokens[i:], cypher_builder=cypher_builder)

        return cypher_builder
