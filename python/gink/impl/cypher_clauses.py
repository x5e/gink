from typing import Set, List, Optional, Iterable
from .typedefs import UserValue

class CypherNode():
    def __init__(self) -> None:
        self.variable: Optional[str] = None
        self.label: Optional[str] = None
        self.rel: Optional[CypherRel] = None

        # For use with CREATE
        self.properties: dict = {}

    def print(self):
        if self.rel:
            self.rel.print()
        else:
            print(self.variable, ":", self.label)
            print("properties: ", self.properties)

class CypherRel():
    def __init__(self) -> None:
        self.var: Optional[str] = None
        self.label: Optional[str] = None
        self.previous_node: Optional[CypherNode] = None
        self.next_node: Optional[CypherNode] = None

    def print(self):
        print(f"({self.previous_node.label})-[{self.label}]->({self.next_node.label})")

class CypherMatch():
    def __init__(self) -> None:
        self.root_nodes: Set[CypherNode] = set()

    def print(self):
        for node in self.root_nodes:
            print(f"({node.variable if node.variable else ''}:{node.label})")

class CypherCreate():
    def __init__(self) -> None:
        self.root_nodes: Set[CypherNode] = set()

    def print(self):
        for node in self.root_nodes:
            node.print()

class CypherWhere():
    def __init__(self) -> None:
        self.variable: Optional[str] = None
        self.property: Optional[str] = None
        self.operator: Optional[str] = None
        self.value: Optional[str] = None

        self.and_: List[CypherWhere] = []
        self.or_: List[CypherWhere] = []

    def print(self):
        print(f"{self.variable}.{self.property} {self.operator} {self.value}")
        for item in self.and_:
            print(f"AND {item.variable}.{item.property} {item.operator} {item.value}")
        for item in self.or_:
            print(f"OR {item.variable}.{item.property} {item.operator} {item.value}")

class CypherSet():
    def __init__(self) -> None:
        self.variable: Optional[str] = None
        self.property: Optional[str] = None
        self.operator: Optional[str] = None
        self.value: Optional[UserValue] = None

    def print(self):
        print(f"{self.variable}.{self.property} {self.operator} {self.value}")


# May eventually move these lists themselves into a variable directly
# inside CypherBuilder.
class CypherReturn():
    """
    Houses a list of variables to return.
    Keeping this as its own class in case I need to add
    more to it later.
    """
    def __init__(self) -> None:
        self.returning: List[str] = []

    def print(self):
        print(self.returning)

class CypherDelete():
    """
    Houses a list of variables to delete.
    Keeping this as its own class in case I need to add
    more to it later.
    """
    def __init__(self) -> None:
        self.deleting: List[str] = []

    def print(self):
        print(self.deleting)