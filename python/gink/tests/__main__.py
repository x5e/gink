from os import chdir
from sys import exit
from pathlib import Path
from nose2 import discover  # type: ignore

chdir(Path(__file__).parent)
exit(discover())
