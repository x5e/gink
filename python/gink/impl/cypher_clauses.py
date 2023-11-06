from typing import Set, List, Optional
from .typedefs import UserValue

class CypherNode():
    def __init__(self) -> None:
        self.variable: Optional[str] = None
        self.label: Optional[str] = None
        self.rel: Optional[CypherRel] = None

        # For use with CREATE
        self.properties: dict = {}

    def to_string(self) -> str:
        returning = "("
        assert self.variable
        returning += self.variable
        if self.label:
            returning += ":" + self.label
        if self.properties:
            returning += "{"
            for key, val in self.properties.items():
                # Make sure there are no quotes in the key so this
                # can be reconstructed as a query
                key = str(key).replace('"', '').replace('\'', '')
                is_val_str = isinstance(val, str)
                # This feels a little hacky, but it is important for only strings
                # to have quotes in a query.
                returning += f"{key}: "
                returning += "'" if is_val_str else ''
                returning += val
                returning += "'" if is_val_str else ''
            returning += "}"
        returning += ")"
        if self.rel:
            assert self.rel.variable or self.rel.label
            returning += f"-[{self.rel.variable or ''}{':' + self.rel.label if self.rel.label else ''}]->"
            assert self.rel.next_node
            returning += self.rel.next_node.to_string()

        return returning
            
class CypherRel():
    def __init__(self) -> None:
        self.variable: Optional[str] = None
        self.label: Optional[str] = None
        self.previous_node: Optional[CypherNode] = None
        self.next_node: Optional[CypherNode] = None

class CypherMatch():
    def __init__(self) -> None:
        self.root_nodes: List[CypherNode] = []

    def to_string(self) -> str:
        if not self.root_nodes:
            raise AssertionError("This MATCH contains no nodes.")
        returning = "MATCH " + self.root_nodes[0].to_string()
        try:
            for node in self.root_nodes[1:]:
                returning += ", " + node.to_string()
        except IndexError:
            return returning
        return returning

class CypherCreate():
    def __init__(self) -> None:
        self.root_nodes: List[CypherNode] = []

    def to_string(self) -> str:
        returning = "CREATE "
        for node in self.root_nodes:
            returning += node.to_string()
        
        return returning

class CypherWhere():
    def __init__(self) -> None:
        self.variable: Optional[str] = None
        self.property: Optional[str] = None
        self.operator: Optional[str] = None
        self.value: Optional[str] = None

        # Going to need to think through AND and OR more.
        self.and_: List[CypherWhere] = []
        self.or_: List[CypherWhere] = []

    def to_string(self) -> str:
        returning = "WHERE "
        returning += f"{self.variable}.{self.property} {self.operator} {self.value}"
        and_list = self.and_
        while and_list:
            for and_ in and_list:
                returning += f" AND {and_.variable}.{and_.property} {and_.operator} {and_.value}"
            and_list = and_.and_

        or_list = self.or_
        while or_list:
            for or_ in or_list:
                returning += f" OR {or_.variable}.{or_.property} {or_.operator} {or_.value}"
            or_list = and_.and_

        return returning

class CypherSet():
    def __init__(self) -> None:
        self.variable: Optional[str] = None
        self.property: Optional[str] = None
        self.operator: Optional[str] = None
        self.value: Optional[UserValue] = None

    def to_string(self) -> str:
        return f"SET {self.variable}.{self.property} {self.operator} {self.value}" #type: ignore


# May eventually move these lists themselves into a variable directly
# inside CypherQuery.
class CypherReturn():
    """
    Houses a list of variables to return.
    Keeping this as its own class in case I need to add
    more to it later.
    """
    def __init__(self) -> None:
        self.returning: List[str] = []

    def to_string(self) -> str:
        returning = "RETURN (" + self.returning[0]
        for var in self.returning[1:]:
            returning += ", " + var
        returning += ")"
        return returning

class CypherDelete():
    """
    Houses a list of variables to delete.
    Keeping this as its own class in case I need to add
    more to it later.
    """
    def __init__(self) -> None:
        self.deleting: List[str] = []

    def to_string(self) -> str:
        returning = "DELETE (" + self.deleting[0]
        for var in self.deleting[1:]:
            returning += ", " + var
        returning += ")"
        return returning