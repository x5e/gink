from sys import stdin, stderr
from termios import TCSADRAIN, tcsetattr, tcgetattr
from tty import setraw
from typing import Optional, TextIO, List
from code import InteractiveInterpreter
from logging import getLogger

class SelectableConsole(InteractiveInterpreter):

    def __init__(self, locals, input_handle: TextIO = stdin, output_handle: TextIO = stderr):
        super().__init__(locals)
        self._buffer: List[str] = []
        self._input: TextIO = input_handle
        self._output: TextIO = output_handle
        self._settings: Optional[list] = None
        self._prompt = "python+gink> "
        self._logger = getLogger(self.__class__.__name__)

    def fileno(self):
      return self._input.fileno()

    def __enter__(self):
        self._settings = tcgetattr(self._input.fileno())
        setraw(self._input.fileno())

    def __exit__(self, *_):
        assert self._settings is not None
        tcsetattr(self._input.fileno(), TCSADRAIN, self._settings)

    def call_when_ready(self):
        self.on_character(self._input.read(1))

    def refresh(self):
        self._output.write("\r" + self._prompt + "".join(self._buffer))
        self._output.flush()

    def write(self, data):
        data = data.replace("\n", "\r\n")
        self._output.write(data)
        self._output.flush()

    def on_character(self, character: str) -> None:
        if character == '\x1b':
            self._logger.info("history and keys not yet supported")
        elif character in ('\r'):  # return/enter
            if self._buffer:
                print(end="\r\n", file=self._output)
                combined = "".join(self._buffer)
                result = self.runsource(combined)
                if result is True:
                    self._logger.warning("multi-line input not yet implemented")
                # print(repr("".join(self._buffer)), sep="", file=self._output, end="\r\n")
                self._buffer = []
            else:
                print(file=self._output)
        elif character == "\x15":  # control-U
            need_to_wipe = len(self._buffer) + len(self._prompt)
            self._output.write("\r" + " " * need_to_wipe)
            self._buffer = []
        elif character == '\x04':  # control-D
            if self._buffer:
                self._output.write('\a')  # bell
                self._output.flush()
            else:
                print(file=self._output, end="\r\n")
                raise EOFError()
        elif character in ('\x03'):  # control-C
            raise KeyboardInterrupt()
        elif character in ('\x08', '\x7f'):  # backspace / control-h
            if self._buffer:
                self._buffer.pop()
                self._output.write(character)
                self._output.flush()
            else:
                self._output.write('\a')  # bell
                self._output.flush()
        else:
            if len(repr(character)) == 3 or character == "\\":
                self._buffer.append(character)
                self._output.write(character)
            else:
                self._output.write(repr(character))
            self._output.flush()
