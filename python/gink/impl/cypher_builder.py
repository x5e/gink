"""
To keep Cypher terminology separate from Gink, I've chosen to use names like
Node (Gink's noun), Rel[ationship](Gink's edge/verb)
"""
from typing import Set

class CypherBuilder():
    def __init__(self) -> None:
        self.match: CypherMatch | None = None
        self.create: CypherCreate | None = None

class CypherNode():
    def __init__(self) -> None:
        self.variable: str | None = None
        self.label: str | None = None
        self.rel: CypherRel | None = None

        # For use with CREATE
        self.properties: dict = {}

class CypherRel():
    def __init__(self) -> None:
        self.var: str | None = None
        self.label: str | None = None
        self.previous_node: CypherNode | None = None
        self.next_node: CypherNode | None = None

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
