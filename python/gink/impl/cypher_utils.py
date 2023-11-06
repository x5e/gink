from typing import Iterable
from pygments.token import Keyword, Name, Punctuation, Text, Operator

from ..impl.cypher_builder import *

def build_match(tokens: Iterable) -> CypherMatch:
    assert tokens[1][1] == 'MATCH'
    # When we encounter a -[]->, we need to treat the variable differently.
    is_relationship = False
    # This variable is to let the loop know we are in the final connected node of -[]->()
    is_connected = False
    is_keyword = False
    match_builder = CypherMatch
    i = 0
    while not is_keyword:
    #     try:
        current_token = tokens[i]
    #     except IndexError:
    #         break

        # Marking where we are in the query
        if current_token[0] == Punctuation and "[" in current_token[1]:
                is_relationship = True
        elif current_token[0] == Punctuation and "]" in current_token[1]:
            # Done with relationship, moving on to connected node.
            is_relationship = False
            is_connected = True

        print(current_token)
        # First node in a node-rel-node sequence
        if not is_relationship and not is_connected:
            if current_token[0] == Name.Variable:
                node = CypherNode()
                match_builder.root_nodes.add(node)
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
                    match_builder.root_nodes.add(node)
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
                match_builder.root_nodes.add(node)
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
            next_token = None

        i += 1
    
    return match_builder

def build_create(tokens: Iterable) -> CypherCreate:
    assert tokens[1][1] == 'CREATE'
    # When we encounter a -[]->, we need to treat the variable differently.
    is_relationship = False
    # This variable is to let the loop know we are in the final connected node of -[]->()
    is_connected = False
    in_properties = False
    is_keyword = False
    create_builder = CypherCreate()
    i = 0
    while not is_keyword:
        # try:
        current_token = tokens[i]
        # except IndexError:
        #     break

        # First node in a node-rel-node sequence
        if not is_relationship and not is_connected:
            if current_token[0] == Name.Variable and not in_properties:
                node = CypherNode()
                create_builder.root_nodes.add(node)
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
                    create_builder.root_nodes.add(node)
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

        try:
            next_token = tokens[i+1]
            is_keyword = is_token_keyword(next_token)
        except IndexError:
            next_token = None

        i += 1

    return create_builder

def build_set(tokens: Iterable) -> CypherSet:
    assert tokens[1][1] == 'SET' 
    set_builder = CypherSet()
    is_keyword = False
    i = 0
    while not is_keyword:
        # try:
        current_token = tokens[i]
        # except IndexError:
        #     break
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
            next_token = None

        i += 1

    return set_builder

def where_and_or(tokens: Iterable, where_builder: Optional[CypherWhere]) -> CypherWhere:
    assert tokens[1][1] in ('WHERE', 'AND', 'OR')
    if tokens[1][1] != 'WHERE':
        assert where_builder
    else:
        where_builder = CypherWhere()

    ### More here
    
    return where_builder

def is_token_keyword(token) -> bool:
    if token[0] == Keyword or token[1].upper() == "AND" or token[1].upper() == "OR":
        return True
    return False