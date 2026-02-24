from fastapi.testclient import TestClient
import pytest

# Clean package import (no sys.path hacks)
from backend.main import app, get_db


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *_args, **_kwargs):
        return self

    def __aiter__(self):
        self._index = 0
        return self

    async def __anext__(self):
        if self._index >= len(self.docs):
            raise StopAsyncIteration
        value = self.docs[self._index]
        self._index += 1
        return value


class FakeCollection:
    async def insert_one(self, *_args, **_kwargs):
        return None

    async def update_one(self, *_args, **_kwargs):
        return None

    async def find_one(self, *_args, **_kwargs):
        return None

    def find(self, *_args, **_kwargs):
        return FakeCursor([])


class FakeDB:
    def __init__(self):
        self.jobs = FakeCollection()
        self.lectures = FakeCollection()

    async def command(self, *_args, **_kwargs):
        return {"ok": 1}


@pytest.fixture(autouse=True)
def override_db_dependency():
    fake_db = FakeDB()
    app.dependency_overrides[get_db] = lambda: fake_db
    yield
    app.dependency_overrides.clear()


client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_upload_invalid_file():
    response = client.post(
        "/api/upload",
        files={"file": ("test.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 400


def test_status_not_found():
    response = client.get("/api/status/nonexistent")
    assert response.status_code == 404