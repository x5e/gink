from sys import stdin, stderr
from termios import TCSADRAIN, tcsetattr, tcgetattr, OPOST
from tty import setraw, OFLAG
from typing import Optional, TextIO, List
from code import InteractiveInterpreter
from logging import getLogger
from ctypes import c_int
from fcntl import ioctl
from termios import FIONREAD
from pathlib import Path
from datetime import datetime as DateTime

from .looping import Finished


class SelectableConsole(InteractiveInterpreter):

    def __init__(self, locals_, interactive: bool, heartbeat_to: Optional[Path] = None):
        """ Line mode (non-interactive), if specified, or if not using a TTY.
        """
        super().__init__(locals_)
        self._interactive = interactive
        self._buffer: List[str] = []
        self._input: TextIO = stdin
        self._output: TextIO = stderr
        self._settings: Optional[list] = None
        self._prompt = "python+gink> "
        self._logger = getLogger(self.__class__.__name__)
        self._c_int = c_int()
        self._heartbeat_to = open(heartbeat_to, "a") if heartbeat_to else None

    def close(self):
        pass

    def fileno(self) -> int:
        return self._input.fileno()

    def __enter__(self):
        if self._settings is None and self._interactive:
            fd = self._input.fileno()
            self._settings = tcgetattr(fd)
            setraw(fd)
            mode = tcgetattr(fd)
            mode[OFLAG] = mode[OFLAG] | OPOST
            tcsetattr(fd, TCSADRAIN, mode)

    def __exit__(self, *_):
        if self._settings:
            tcsetattr(self._input.fileno(), TCSADRAIN, self._settings)
            self._settings = None

    def _bytes_available(self) -> int:
        ioctl(self.fileno(), FIONREAD, self._c_int)  # type: ignore
        return self._c_int.value

    def on_ready(self):
        try:
            if self._interactive:
                for _ in range(self._bytes_available()):
                    self.on_character(self._input.read(1))
            else:
                self.on_line(input())
        except KeyboardInterrupt:
            self.write("\nKeyboardInterrupt\n")
        except StopIteration:
            pass
        except EOFError:
            raise Finished()

    def on_line(self, line):
        result = self.runsource(line)
        if result is True:
            self._logger.warning("multi-line input not yet implemented")

    def on_timeout(self):
        if self._interactive:
            data = self._prompt + "".join(self._buffer)
            self._output.write("\r" + data + " ")
            self._output.write("\r" + data)
            self._output.flush()
            if self._heartbeat_to:
                print(str(DateTime.now().time()), file=self._heartbeat_to)

    def write(self, data):
        self._output.write(data)
        self._output.flush()

    def on_character(self, character: str) -> None:
        if character == '\x1b':
            self._logger.info("history and line editing keys not yet supported")
            self._input.read(2)  # swallow extra characters
            raise StopIteration()
        elif character == '\r':  # return/enter
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
        elif character == '\x0c':  # control-L
            self._output.write("\033[H\033[2J")
        elif character == '\x04':  # control-D
            if self._buffer:
                self._output.write('\a')  # bell
            else:
                print(file=self._output, end="\r\n")
                raise EOFError()
        elif character == '\x03':  # control-C
            self._buffer = []
            raise KeyboardInterrupt()
        elif character in ('\x08', '\x7f'):  # backspace / control-h
            if self._buffer:
                self._buffer.pop()
            else:
                self._output.write('\a')  # bell
        else:
            if len(repr(character)) == 3 or character == "\\":
                self._buffer.append(character)
                self._output.write(character)
            else:
                self._output.write(repr(character))
