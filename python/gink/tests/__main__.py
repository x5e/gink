from os import chdir
from sys import exit
from pathlib import Path
import pytest

chdir(Path(__file__).parent)
exit(pytest.main())
