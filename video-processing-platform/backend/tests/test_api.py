from fastapi.testclient import TestClient
import pytest
import sys
from pathlib import Path
from datetime import datetime, UTC

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import app, get_db


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *_args, **_kwargs):
        return self

    def limit(self, limit: int):
        self.docs = self.docs[:limit]
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
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    async def insert_one(self, doc):
        self.docs.append(doc)
        return None

    async def update_one(self, query, update, upsert=False):
        target = None
        for doc in self.docs:
            if all(doc.get(key) == value for key, value in query.items()):
                target = doc
                break

        if target is None and upsert:
            target = dict(query)
            self.docs.append(target)

        if target is not None and "$set" in update:
            target.update(update["$set"])

        return None

    async def find_one(self, query=None):
        query = query or {}
        for doc in self.docs:
            if all(doc.get(key) == value for key, value in query.items()):
                return doc
        return None

    async def count_documents(self, query):
        if "status" in query and isinstance(query["status"], dict) and "$in" in query["status"]:
            values = set(query["status"]["$in"])
            return sum(1 for doc in self.docs if doc.get("status") in values)
        return sum(1 for doc in self.docs if all(doc.get(key) == value for key, value in query.items()))

    def find(self, query=None):
        query = query or {}
        filtered = [
            doc
            for doc in self.docs
            if all(doc.get(key) == value for key, value in query.items())
        ]
        return FakeCursor(filtered)


class FakeDB:
    def __init__(self):
        now = datetime.now(UTC)
        self.jobs = FakeCollection(
            [
                {
                    "job_id": "job-failed",
                    "filename": "failed.mp4",
                    "status": "failed",
                    "progress": 50,
                    "updated_at": now,
                    "formats": ["720p"],
                },
                {
                    "job_id": "job-done",
                    "filename": "done.mp4",
                    "status": "completed",
                    "progress": 100,
                    "updated_at": now,
                    "formats": ["720p"],
                },
            ]
        )
        self.lectures = FakeCollection(
            [
                {
                    "slug": "intro",
                    "title": "Intro",
                    "description": "First lecture",
                    "duration": "10:00",
                    "image": "https://images.unsplash.com/photo-1",
                    "publishedDate": "Jan 01, 2026",
                    "views": "0 views",
                    "aiSummary": "summary",
                    "keyConcepts": [],
                }
            ]
        )

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


def test_dashboard_summary():
    response = client.get("/api/admin/dashboard-summary")
    assert response.status_code == 200
    body = response.json()
    assert body["totalLectures"] == 1
    assert body["completedJobs"] == 1
    assert body["failedJobs"] == 1
    assert len(body["recentJobs"]) >= 1


def test_retry_job_not_found():
    response = client.post("/api/jobs/unknown/retry")
    assert response.status_code == 404


def test_retry_job_success():
    response = client.post("/api/jobs/job-failed/retry")
    assert response.status_code == 200
    assert response.json()["message"] == "Retry started"
