from select import select

import pytest

from ..impl.watcher import Watcher


@pytest.mark.skipif(not Watcher.supported(), reason="file watcher is not available")
def test_watcher_reports_file_change(tmp_path):
    path = tmp_path / "watched"
    path.write_bytes(b"before")
    watcher = Watcher(path)
    try:
        path.write_bytes(b"after")

        ready_readers, _, _ = select([watcher], [], [], 1)

        assert watcher in ready_readers
        watcher.clear()
    finally:
        watcher.close()

