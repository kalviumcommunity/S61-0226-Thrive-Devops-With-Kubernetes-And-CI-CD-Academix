import uuid
import asyncio
import logging
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pydantic import BaseModel
from fastapi.responses import FileResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("video-api")

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "video_platform")
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads"))

app = FastAPI(title="Video Processing API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class KeyConcept(BaseModel):
    title: str
    timestamp: str


class Lecture(BaseModel):
    slug: str
    title: str
    description: str
    duration: str
    image: str
    publishedDate: str
    views: str
    aiSummary: str
    keyConcepts: list[KeyConcept]


class ViewPayload(BaseModel):
    userId: str


class JobStatus(BaseModel):
    id: str
    filename: str
    status: str
    progress: float
    formats: list[str]


def get_db() -> AsyncIOMotorDatabase:
    db = getattr(app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
    return db


@app.on_event("startup")
async def startup_db() -> None:
    client = AsyncIOMotorClient(MONGO_URL)
    app.state.db_client = client
    app.state.db = client[MONGO_DB_NAME]


@app.on_event("shutdown")
async def shutdown_db() -> None:
    client = getattr(app.state, "db_client", None)
    if client is not None:
        client.close()


@app.get("/health")
async def health_check(db: AsyncIOMotorDatabase = Depends(get_db)) -> dict[str, Any]:
    await db.command({"ping": 1})
    return {"status": "healthy", "service": "video-api"}


@app.post("/api/upload")
async def upload_video(
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict[str, str]:
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video")

    job_id = str(uuid.uuid4())[:8]
    formats = ["720p", "480p", "360p"]
    created_at = datetime.utcnow()

    contents = await file.read()
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, f"{job_id}_{file.filename}")

    try:
        with open(file_path, "wb") as f:
            f.write(contents)
    except OSError:
        raise HTTPException(status_code=500, detail="Could not persist uploaded file")

    job_doc = {
        "job_id": job_id,
        "filename": file.filename,
        "content_type": file.content_type,
        "status": "queued",
        "progress": 0.0,
        "formats": formats,
        "created_at": created_at,
        "updated_at": created_at,
        "file_path": file_path,
    }
    await db.jobs.insert_one(job_doc)

    lecture_doc = {
        "slug": job_id,
        "title": file.filename or job_id,
        "description": "Transcoded lecture generated from uploaded video.",
        "duration": "10:00",
        "image": "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1200&q=80",
        "publishedDate": created_at.strftime("%B %d, %Y"),
        "views": "0 views",
        "aiSummary": "Summary will be generated after initial student engagement.",
        "keyConcepts": [],
        "created_at": created_at,
        "updated_at": created_at,
        "viewedBy": [],
    }
    existing_lecture = await db.lectures.find_one({"slug": job_id})
    if not existing_lecture:
        await db.lectures.insert_one(lecture_doc)

    asyncio.create_task(transcode(job_id))
    return {"job_id": job_id, "message": "Upload accepted, transcoding started"}


@app.get("/api/status/{job_id}", response_model=JobStatus)
async def get_status(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> JobStatus:
    doc = await db.jobs.find_one({"job_id": job_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatus(
        id=doc["job_id"],
        filename=doc["filename"],
        status=doc["status"],
        progress=float(doc.get("progress", 0.0)),
        formats=list(doc.get("formats", [])),
    )


async def _resolve_media_response(
    job_id: str,
    db: AsyncIOMotorDatabase,
) -> FileResponse:
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    file_path = job.get("file_path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video file not found")
    filename = job.get("filename", f"{job_id}.mp4")
    media_type = job.get("content_type") or "video/mp4"
    return FileResponse(path=file_path, media_type=media_type, filename=filename)


@app.get("/media/{job_id}")
async def get_media_legacy(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> FileResponse:
    return await _resolve_media_response(job_id, db)


@app.get("/api/media/{job_id}")
async def get_media(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> FileResponse:
    return await _resolve_media_response(job_id, db)


@app.post("/api/lectures/{slug}/view")
async def register_view(
    slug: str,
    payload: ViewPayload,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict[str, Any]:
    lecture_doc = await db.lectures.find_one({"slug": slug})
    if not lecture_doc:
        raise HTTPException(status_code=404, detail="Lecture not found")

    user_id = payload.userId
    viewed_by = list(lecture_doc.get("viewedBy", []))
    if user_id in viewed_by:
        return {"views": lecture_doc.get("views", "0 views")}

    viewed_by.append(user_id)
    raw_views = str(lecture_doc.get("views", "0"))
    try:
        current_views = int(raw_views.split()[0])
    except (ValueError, IndexError):
        current_views = 0
    current_views += 1
    views_str = "1 view" if current_views == 1 else f"{current_views} views"

    await db.lectures.update_one(
        {"_id": lecture_doc["_id"]},
        {
            "$set": {
                "views": views_str,
                "viewedBy": viewed_by,
                "updated_at": datetime.utcnow(),
            }
        },
    )

    return {"views": views_str}


@app.get("/api/lectures", response_model=list[Lecture])
async def list_lectures(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[Lecture]:
    cursor = db.lectures.find({})
    results: list[Lecture] = []
    async for doc in cursor:
        results.append(
            Lecture(
                slug=doc["slug"],
                title=doc["title"],
                description=doc["description"],
                duration=doc["duration"],
                image=doc["image"],
                publishedDate=doc["publishedDate"],
                views=doc["views"],
                aiSummary=doc["aiSummary"],
                keyConcepts=[
                    KeyConcept(title=item["title"], timestamp=item["timestamp"])
                    for item in doc.get("keyConcepts", [])
                ],
            )
        )
    return results


@app.get("/api/lectures/{slug}", response_model=Lecture)
async def get_lecture(
    slug: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Lecture:
    doc = await db.lectures.find_one({"slug": slug})
    if not doc:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return Lecture(
        slug=doc["slug"],
        title=doc["title"],
        description=doc["description"],
        duration=doc["duration"],
        image=doc["image"],
        publishedDate=doc["publishedDate"],
        views=doc["views"],
        aiSummary=doc["aiSummary"],
        keyConcepts=[
            KeyConcept(title=item["title"], timestamp=item["timestamp"])
            for item in doc.get("keyConcepts", [])
        ],
    )


@app.post("/api/lectures", response_model=Lecture)
async def create_lecture(
    lecture: Lecture,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Lecture:
    existing = await db.lectures.find_one({"slug": lecture.slug})
    if existing:
        raise HTTPException(status_code=409, detail="Lecture with this slug already exists")
    now = datetime.utcnow()
    doc = lecture.model_dump()
    doc["created_at"] = now
    doc["updated_at"] = now
    await db.lectures.insert_one(doc)
    return lecture


async def transcode(job_id: str) -> None:
    db = get_db()
    await db.jobs.update_one(
        {"job_id": job_id},
        {"$set": {"status": "processing", "updated_at": datetime.utcnow()}},
    )

    for i in range(1, 11):
        await asyncio.sleep(2)
        progress_value = i * 10
        await db.jobs.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "progress": progress_value,
                    "updated_at": datetime.utcnow(),
                }
            },
        )

    await db.jobs.update_one(
        {"job_id": job_id},
        {"$set": {"status": "completed", "progress": 100.0, "updated_at": datetime.utcnow()}},
    )

    logger.info("Job %s transcoding completed", job_id)
if __name__ == "__main__":
    for route in app.routes:
        print(route.path)


print("\nRegistered Routes:\n")
for route in app.routes:
    print(route.path)
print("\n")
