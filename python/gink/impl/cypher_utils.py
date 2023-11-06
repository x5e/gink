from pygments.token import Keyword

def is_token_keyword(token) -> bool:
    if token[0] == Keyword or token[1].upper() == "AND" or token[1].upper() == "OR":
        return True
    return False