import uuid
import asyncio
import logging
import os
from datetime import datetime
from typing import Any

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("video-api")

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "video_platform")

app = FastAPI(title="Video Processing API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    file_path = f"/tmp/{job_id}_{file.filename}"

    try:
        with open(file_path, "wb") as f:
            f.write(contents)
    except OSError:
        raise HTTPException(status_code=500, detail="Could not persist uploaded file")

    job_doc = {
        "job_id": job_id,
        "filename": file.filename,
        "status": "queued",
        "progress": 0.0,
        "formats": formats,
        "created_at": created_at,
        "updated_at": created_at,
        "file_path": file_path,
    }
    await db.jobs.insert_one(job_doc)

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
