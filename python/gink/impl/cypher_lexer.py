from py2neo.cypher.lexer import CypherLexer as Lexer

class CypherLexer(Lexer):
    """
    Just a wrapper for py2neo's Cypher lexer for now.
    Will eventually have additional functionality needed
    for Gink.
    """
    def __init__(self):
        Lexer.__init__(self)
