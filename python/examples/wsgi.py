from typing import *
from gink import *

def hello(_, start_response) -> Iterable[bytes]:
    start_response("200 OK", [('Content-type', 'text/plain')])
    yield b'Hello, World!\n'
