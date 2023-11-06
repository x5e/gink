"""
To keep Cypher terminology separate from Gink, I've chosen to use names like
Node (Gink's noun), Rel[ationship](Gink's edge/verb)
"""
from typing import Set, List, Optional
from .typedefs import UserValue

class CypherBuilder():
    def __init__(self) -> None:
        self.match: Optional[CypherMatch] = None
        self.create: Optional[CypherCreate] = None
        self.where: Optional[CypherWhere] = None
        self.set: Optional[List[CypherSet]] = None

        self.delete: Optional[CypherDelete] = None
        self.return_: Optional[CypherReturn] = None

    def add_set(self, cypher_set):
        assert isinstance(cypher_set, CypherSet)
        if not self.set:
            self.set = []
        self.set.append(cypher_set)

    def print_set(self):
        """
        Prints every SET clause in the query.
        """
        for set in self.set:
            set.print()

class CypherNode():
    def __init__(self) -> None:
        self.variable: Optional[str] = None
        self.label: Optional[str] = None
        self.rel: Optional[CypherRel] = None

        # For use with CREATE
        self.properties: dict = {}

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
            print(node.label, node.properties, "-[", node.rel.label, "]->", node.rel.next_node.label, node.rel.next_node.properties)

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
