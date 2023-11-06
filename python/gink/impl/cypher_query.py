"""
To keep Cypher terminology separate from Gink, I've chosen to use names like
Node (Gink's Vertex), Rel[ationship](Gink's Edge/Verb)
"""
from typing import List, Optional
from pygments.token import Name, Punctuation, Operator
from .cypher_utils import is_token_keyword
from .cypher_clauses import *

class CypherQuery():
    def __init__(self) -> None:
        self.match: Optional[CypherMatch] = None
        self.create: Optional[CypherCreate] = None
        self.where: Optional[CypherWhere] = None
        self.set: Optional[List[CypherSet]] = None
        self.delete: Optional[CypherDelete] = None
        self.return_: Optional[CypherReturn] = None

    def build_match(self, tokens: list) -> CypherMatch:
        """
        Constructs a MATCH based on the tokens provided. The first token
        should be a Keyword MATCH.

        This method places the CypherMatch into the instance of the CypherQuery,
        so there is no need to do that with the return value.
        """
        assert tokens[0][1] == 'MATCH'
        # When we encounter a -[]->, we need to treat the variable differently.
        is_relationship = False
        # This variable is to let the loop know we are in the final connected node of -[]->()
        is_connected = False
        is_keyword = False

        match_builder = CypherMatch()
        self.match = match_builder
        i = 0
        while not is_keyword:
            current_token = tokens[i]
            # Marking where we are in the query
            if current_token[0] == Punctuation and "[" in current_token[1]:
                is_relationship = True
            elif current_token[0] == Punctuation and "]" in current_token[1]:
                # Done with relationship, moving on to connected node.
                is_relationship = False
                is_connected = True

            # First node in a node-rel-node sequence
            if not is_relationship and not is_connected:
                if current_token[0] == Name.Variable:
                    node = CypherNode()
                    match_builder.root_nodes.append(node)
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
                        match_builder.root_nodes.append(node)
                        node.label = current_token[1]

            elif is_relationship and not is_connected:
                if current_token[0] == Name.Variable:
                    # Node still refers to the variable declared above, since a relationship has to
                    # create a node first.
                    rel = CypherRel()
                    node.rel = rel
                    rel.variable = current_token[1]
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

            try:
                next_token = tokens[i+1]
                is_keyword = is_token_keyword(next_token)
            except IndexError:
                break

            i += 1

        return match_builder
    
    def build_create(self, tokens: list) -> CypherCreate:
        """
        Constructs a CREATE based on the tokens provided. The first token
        should be a Keyword CREATE.

        This method places the CypherCreate into the instance of the CypherQuery,
        so there is no need to do that with the return value.
        """
        assert tokens[0][1] == 'CREATE'
        # When we encounter a -[]->, we need to treat the variable differently.
        is_relationship = False
        # This variable is to let the loop know we are in the final connected node of -[]->()
        is_connected = False
        in_properties = False
        is_keyword = False

        create_builder = CypherCreate()
        self.create = create_builder
        i = 0
        while not is_keyword:
            current_token = tokens[i]
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
            # First node in a node-rel-node sequence
            if not is_relationship and not is_connected:
                if current_token[0] == Name.Variable and not in_properties:
                    node = CypherNode()
                    create_builder.root_nodes.append(node)
                    node.variable = current_token[1]

                elif current_token[0] == Name.Variable and in_properties:
                    current_property = current_token[1]
                    node.properties[current_property] = None

                # If the second to last token was a variable and we are in properties,
                # it should be safe to assume this is a value, since properties follow
                # {property1: 'value1'}
                elif tokens[i-2][0] == Name.Variable and in_properties:
                    property_value: str = current_token[1]
                    property_value = property_value.replace("'", "").replace("\"", "")
                    node.properties[current_property] = property_value

                elif current_token[0] == Name.Label:
                    last_var = tokens[i-2][1] if tokens[i-2][0] == Name.Variable else None
                    # If the query includes a variable, add the label to the node we just created
                    if last_var:
                        node.label = current_token[1]
                    # Otherwise, we need to create the node here without a variable.
                    else:
                        node = CypherNode()
                        # Remember this node specifically when we reach the end of (node)-[rel]-(node)
                        create_builder.root_nodes.append(node)
                        node.label = current_token[1]

            elif is_relationship and not is_connected:
                if current_token[0] == Name.Variable:
                    # Node still refers to the variable declared above, since a relationship has to
                    # create a node first.
                    rel = CypherRel()
                    node.rel = rel
                    rel.variable = current_token[1]
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

            try:
                next_token = tokens[i+1]
                is_keyword = is_token_keyword(next_token)
            except IndexError:
                break

            i += 1

        return create_builder

    def build_set(self, tokens: list) -> CypherSet:
        """
        Constructs a SET based on the tokens provided. The first token
        should be a Keyword SET.

        This method places the CypherSet into the instance of the CypherQuery,
        so there is no need to do that with the return value.
        """
        assert tokens[0][1] == 'SET' 
        set_builder = CypherSet()
        is_keyword = False
        i = 0
        while not is_keyword:
            current_token = tokens[i]
            # SET clauses are pretty simple - SET var.property operator value
            if tokens[i-1][1] == "." and current_token[0] == Name.Variable:
                set_builder.property = current_token[1]
            elif current_token[0] == Name.Variable:
                set_builder.variable = current_token[1]
            elif current_token[0] == Operator and not current_token[1] == ".":
                set_builder.operator = current_token[1]
            elif tokens[i-1][0] == Operator and not tokens[i-1][1] == ".":
                set_builder.value = current_token[1]

            try:
                next_token = tokens[i+1]
                is_keyword = is_token_keyword(next_token)
            except IndexError:
                break

            i += 1

        if not self.set:
            self.set = []
        self.set.append(set_builder)
        return set_builder

    def build_where_and_or(self, tokens: list) -> CypherWhere:
        """
        This is a sort of 'catch-all' for WHERE, AND, and OR,
        which all behave similarly.

        Constructs a WHERE if the first token is WHERE, otherwise add an AND or OR to a 
        provided WhereBuilder.

        This method places the CypherWhere into the instance of the CypherQuery,
        so there is no need to do that with the return value.
        """
        assert tokens[0][1] in ('WHERE', 'AND', 'OR')
        if tokens[0][1] == 'AND':
            assert self.where
            where_builder = CypherWhere()
            self.where.and_.append(where_builder)
        elif tokens[0][1] == 'OR':
            assert self.where    
            where_builder = CypherWhere()
            self.where.or_.append(where_builder)
        else:
            where_builder = CypherWhere()
            self.where = where_builder
        is_keyword = False
        i = 0
        while not is_keyword:
            current_token = tokens[i]
            if tokens[i-1][1] == "." and current_token[0] == Name.Variable:
                    where_builder.property = current_token[1]
            elif current_token[0] == Name.Variable:
                where_builder.variable = current_token[1]
            elif current_token[0] == Operator and not current_token[1] == ".":
                where_builder.operator = current_token[1]
            elif tokens[i-1][0] == Operator and not tokens[i-1][1] == ".":
                where_builder.value = current_token[1]

            try:
                next_token = tokens[i+1]
                is_keyword = is_token_keyword(next_token)
            except IndexError:
                break

            i += 1
        
        return where_builder
    
    def build_return(self, tokens: list) -> CypherReturn:
        """
        Constructs a RETURN based on the tokens provided. The first token
        should be a Keyword RETURN.

        This method places the CypherReturn into the instance of the CypherQuery,
        so there is no need to do that with the return value.
        """
        assert tokens[0][1] == 'RETURN'

        return_builder = CypherReturn()
        self.return_ = return_builder

        is_keyword = False
        i = 0
        while not is_keyword:
            current_token = tokens[i]
            if current_token[0] == Name.Variable:
                return_builder.returning.append(current_token[1])

            try:
                next_token = tokens[i+1]
                is_keyword = is_token_keyword(next_token)
            except IndexError:
                break

            i += 1

        return return_builder

    def build_delete(self, tokens: list) -> CypherDelete:
        """
        Constructs a DELETE based on the tokens provided. The first token
        should be a Keyword DELETE.

        This method places the CypherDelete into the instance of the CypherQuery,
        so there is no need to do that with the return value.
        """
        assert tokens[0][1] == 'DELETE'
        delete_builder = CypherDelete()
        self.delete = delete_builder

        is_keyword = False
        i = 0
        while not is_keyword:
            current_token = tokens[i]
            if current_token[0] == Name.Variable:
                delete_builder.deleting.append(current_token[1])

            try:
                next_token = tokens[i+1]
                is_keyword = is_token_keyword(next_token)
            except IndexError:
                break

            i += 1
            
        return delete_builder
    
    def to_string(self) -> str:
        clauses = [self.create, self.match, self.where, self.set, self.return_, self.delete]
        returning = ""
        for clause in clauses:
            if clause == self.set and self.set:
                for s in self.set:
                    returning += " " + s.to_string()
            elif clause:
                returning += " " + clause.to_string() #type: ignore

        return returning.lstrip()