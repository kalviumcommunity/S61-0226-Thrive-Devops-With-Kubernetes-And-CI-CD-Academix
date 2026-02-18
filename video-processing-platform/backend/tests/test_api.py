from fastapi.testclient import TestClient
from main import app

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
