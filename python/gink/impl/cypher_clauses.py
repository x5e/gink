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
            returning += str(self.properties)
        returning += ")"
        if self.rel:
            assert self.rel.var or self.rel.label
            returning += f"-[{self.rel.var or ''}{':' + self.rel.label if self.rel.label else ''}]->"
            assert self.rel.next_node
            returning += self.rel.next_node.to_string()

        return returning
            
class CypherRel():
    def __init__(self) -> None:
        self.var: Optional[str] = None
        self.label: Optional[str] = None
        self.previous_node: Optional[CypherNode] = None
        self.next_node: Optional[CypherNode] = None

class CypherMatch():
    def __init__(self) -> None:
        self.root_nodes: Set[CypherNode] = set()

    def print(self):
        for node in self.root_nodes:
            print(node.to_string())

class CypherCreate():
    def __init__(self) -> None:
        self.root_nodes: Set[CypherNode] = set()

    def to_string(self):
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

    def to_string(self):
        returning = "WHERE "
        returning += f"{self.variable}.{self.property} {self.operator} {self.value}"
        for item in self.and_:
            returning += f" AND {item.variable}.{item.property} {item.operator} {item.value}"
        for item in self.or_:
            returning += f" OR {item.variable}.{item.property} {item.operator} {item.value}"

        return returning

class CypherSet():
    def __init__(self) -> None:
        self.variable: Optional[str] = None
        self.property: Optional[str] = None
        self.operator: Optional[str] = None
        self.value: Optional[UserValue] = None

    def to_string(self):
        return f"SET {self.variable}.{self.property} {self.operator} {self.value}"


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

    def to_string(self):
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

    def to_string(self):
        returning = "RETURN (" + self.deleting[0]
        for var in self.deleting[1:]:
            returning += ", " + var
        returning += ")"
        return returning