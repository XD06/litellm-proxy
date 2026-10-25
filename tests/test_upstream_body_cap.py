"""Non-stream upstream bodies are read with a hard cap.

preload_content=True / bare resp.read() pulled the entire body into memory:
one hostile or broken upstream could OOM a worker with a multi-GB response.
These tests pin the two capped readers directly (no network needed)."""
import unittest
from urllib.error import URLError

from upstream_client import (
    _MAX_NONSTREAM_RESPONSE_BYTES,
    _read_capped_urllib,
    _read_nonstream_capped_urllib3,
)


class _FakeUrllib3Resp:
    def __init__(self, chunks):
        self._chunks = list(chunks)
        self.closed = False

    def read(self, amt):
        if not self._chunks:
            return b""
        return self._chunks.pop(0)

    def close(self):
        self.closed = True


class _FakeUrllibResp:
    def __init__(self, data):
        self._data = data

    def read(self, amt=None):
        return self._data[:amt] if amt is not None else self._data


class ReadCappedUrllib3Tests(unittest.TestCase):
    def test_body_under_cap_is_returned_and_conn_closed(self):
        resp = _FakeUrllib3Resp([b"hello ", b"world"])
        self.assertEqual(_read_nonstream_capped_urllib3(resp), b"hello world")
        self.assertTrue(resp.closed)

    def test_body_over_cap_raises_and_conn_closed(self):
        resp = _FakeUrllib3Resp([b"x" * (_MAX_NONSTREAM_RESPONSE_BYTES + 1)])
        with self.assertRaises(URLError):
            _read_nonstream_capped_urllib3(resp)
        self.assertTrue(resp.closed)

    def test_cap_over_multiple_chunks(self):
        cap = 1024
        chunks = [b"z" * 600, b"z" * 600]  # each under cap, sum over
        with self.assertRaises(URLError):
            _read_nonstream_capped_urllib3(_FakeUrllib3Resp(chunks), cap=cap)


class ReadCappedUrllibTests(unittest.TestCase):
    def test_body_under_cap_is_returned(self):
        self.assertEqual(_read_capped_urllib(_FakeUrllibResp(b"ok")), b"ok")

    def test_body_over_cap_raises(self):
        resp = _FakeUrllibResp(b"y" * (_MAX_NONSTREAM_RESPONSE_BYTES + 1))
        with self.assertRaises(URLError):
            _read_capped_urllib(resp)


if __name__ == "__main__":
    unittest.main()
