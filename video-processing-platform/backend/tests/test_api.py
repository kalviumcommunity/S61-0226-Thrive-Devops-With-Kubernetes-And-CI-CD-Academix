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
                    # the numeric seconds will be computed when converting to Lecture model
                    "image": "https://images.unsplash.com/photo-1",
                    "publishedDate": "Jan 01, 2026",
                    "views": "0 views",
                    "aiSummary": "summary",
                    "keyConcepts": [],
                    "viewedBy": [],
                    "progress": {},
                }
            ]
        )

    async def command(self, *_args, **_kwargs):
        return {"ok": 1}


@pytest.fixture(autouse=True)
def override_db_dependency():
    fake_db = FakeDB()
    app.state.liveness_ok = True
    app.state.readiness_ok = True
    app.dependency_overrides[get_db] = lambda: fake_db
    yield
    app.dependency_overrides.clear()

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_liveness_probe_ok():
    response = client.get("/health/liveness")
    assert response.status_code == 200
    assert response.json()["status"] == "alive"


def test_readiness_probe_ok():
    response = client.get("/health/readiness")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"


def test_request_id_header_is_added():
    response = client.get("/health")
    assert response.status_code == 200
    assert "x-request-id" in response.headers


def test_observability_metrics_snapshot():
    # Generate a couple of requests so snapshot has data.
    client.get("/health")
    client.get("/health/readiness")

    snapshot = client.get("/observability/metrics-snapshot")
    assert snapshot.status_code == 200
    body = snapshot.json()
    assert body["service"] == "video-api"
    assert body["requestsTotal"] >= 2
    assert "latencyMs" in body
    assert "statusCounts" in body


def test_readiness_probe_can_fail_without_liveness_failing():
    toggle = client.post("/api/admin/probes/readiness", json={"enabled": False})
    assert toggle.status_code == 200
    assert toggle.json()["enabled"] is False

    readiness = client.get("/health/readiness")
    assert readiness.status_code == 503

    liveness = client.get("/health/liveness")
    assert liveness.status_code == 200


def test_liveness_probe_can_be_forced_to_fail():
    toggle = client.post("/api/admin/probes/liveness", json={"enabled": False})
    assert toggle.status_code == 200
    assert toggle.json()["enabled"] is False

    response = client.get("/health/liveness")
    assert response.status_code == 500

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


def test_progress_api():
    # initially no progress
    response = client.get("/api/lectures/intro/progress/user1")
    assert response.status_code == 200
    assert response.json()["progress"] == 0.0

    # update progress
    resp2 = client.post(
        "/api/lectures/intro/progress",
        json={"userId": "user1", "seconds": 12.5},
    )
    assert resp2.status_code == 200
    assert resp2.json()["progress"] == 12.5

    # fetch again returns updated value
    resp3 = client.get("/api/lectures/intro/progress/user1")
    assert resp3.status_code == 200
    assert resp3.json()["progress"] == 12.5

    # overwrite value
    resp4 = client.post(
        "/api/lectures/intro/progress",
        json={"userId": "user1", "seconds": 30},
    )
    assert resp4.status_code == 200
    assert resp4.json()["progress"] == 30

    resp5 = client.get("/api/lectures/intro/progress/user1")
    assert resp5.json()["progress"] == 30


def test_search_transcript():
    # lecture intro has no transcript in fake DB so first add one
    fake = app.dependency_overrides[get_db]()
    fake.lectures.docs[0]["transcript"] = [
        {"timestamp": "00:00", "text": "first sentence about testing"},
        {"timestamp": "01:00", "text": "another line with keyword"},
    ]
    resp = client.get("/api/lectures/intro/search?q=keyword")
    assert resp.status_code == 200
    assert len(resp.json()["matches"]) == 1
    assert resp.json()["matches"][0]["timestamp"] == "01:00"


def test_ai_transcript_endpoint():
    # fake DB has empty transcript initially - endpoint should return default build_transcript output
    resp = client.post("/api/lectures/intro/ai-transcript")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data.get("transcript"), list)
    # should include at least the first timestamp
    assert data["transcript"][0].get("timestamp") == "00:00"


def test_generated_transcript_persists():
    # after regenerating, fetching the lecture should include the same transcript
    resp1 = client.post("/api/lectures/intro/ai-transcript")
    assert resp1.status_code == 200
    transcript = resp1.json()["transcript"]

    resp2 = client.get("/api/lectures/intro")
    assert resp2.status_code == 200
    data = resp2.json()
    assert data.get("transcript") == transcript


def test_get_lecture_includes_seconds():
    # simple fetch should round-trip duration and include computed seconds
    resp = client.get("/api/lectures/intro")
    assert resp.status_code == 200
    data = resp.json()
    assert data["duration"] == "10:00"
    assert abs(data.get("durationSeconds", 0) - 600) < 1


def test_key_concepts_endpoint():
    # lecture intro starts with empty concepts
    resp = client.get("/api/lectures/intro/key-concepts")
    assert resp.status_code == 200
    assert resp.json()["keyConcepts"] == []
    # add concepts and retry
    fake = app.dependency_overrides[get_db]()
    fake.lectures.docs[0]["keyConcepts"] = [{"title": "Test", "timestamp": "00:10"}]
    resp2 = client.get("/api/lectures/intro/key-concepts")
    assert resp2.status_code == 200
    assert resp2.json()["keyConcepts"][0]["title"] == "Test"


def test_export_transcript():
    fake = app.dependency_overrides[get_db]()
    fake.lectures.docs[0]["transcript"] = [
        {"timestamp": "00:00", "text": "hello"},
        {"timestamp": "00:10", "text": "world"},
    ]
    resp = client.get("/api/lectures/intro/transcript/export?format=txt")
    assert resp.status_code == 200
    assert "hello" in resp.text
    resp2 = client.get("/api/lectures/intro/transcript/export?format=srt")
    assert resp2.status_code == 200
    assert "1" in resp2.text
    # vtt format
    resp3 = client.get("/api/lectures/intro/transcript/export?format=vtt")
    assert resp3.status_code == 200
    assert resp3.text.startswith("WEBVTT")
    # live summary/concepts, using a timestamp matching the first segment
    resp4 = client.get("/api/lectures/intro/live-summary?timestamp=0")
    assert resp4.status_code == 200
    assert "summary" in resp4.json()
    resp5 = client.get("/api/lectures/intro/live-concepts?timestamp=0")
    assert resp5.status_code == 200
    assert isinstance(resp5.json().get("keyConcepts"), list)
