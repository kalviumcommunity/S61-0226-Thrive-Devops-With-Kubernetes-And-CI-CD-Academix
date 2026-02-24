import asyncio
import logging
import os
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("video-api")

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "video_platform")
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads")))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(1024 * 1024 * 1024)))

app = FastAPI(title="Video Processing API", version="1.1.0")

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
    videoUrl: str | None = None


class LectureUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    duration: str | None = None
    image: str | None = None
    publishedDate: str | None = None
    views: str | None = None
    aiSummary: str | None = None
    keyConcepts: list[KeyConcept] | None = None
    videoUrl: str | None = None


class ViewPayload(BaseModel):
    userId: str


class JobStatus(BaseModel):
    id: str
    filename: str
    status: str
    progress: float
    formats: list[str]


class DashboardJob(BaseModel):
    id: str
    filename: str
    status: str
    progress: float
    updatedAt: str


class DashboardSummary(BaseModel):
    totalLectures: int
    activeJobs: int
    completedJobs: int
    failedJobs: int
    recentJobs: list[DashboardJob]


def utcnow() -> datetime:
    return datetime.now(UTC)


def slugify(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9\s-]", "", value).strip().lower()
    compact = re.sub(r"[-\s]+", "-", normalized)
    return compact or "lecture"


def get_db() -> AsyncIOMotorDatabase:
    db = getattr(app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
    return db


def lecture_from_doc(doc: dict[str, Any]) -> Lecture:
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
        videoUrl=doc.get("videoUrl"),
    )


def to_iso_string(value: Any) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.isoformat()
    return utcnow().isoformat()


async def seed_demo_lectures(db: AsyncIOMotorDatabase) -> None:
    existing_count = await db.lectures.count_documents({})
    if existing_count > 0:
        return

    now = utcnow()
    demo_lectures = [
        {
            "slug": "distributed-systems-101",
            "title": "Distributed Systems 101",
            "description": "Core concepts of distributed systems, consensus, and fault tolerance.",
            "duration": "42:18",
            "image": "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
            "publishedDate": "February 24, 2026",
            "views": "128 views",
            "aiSummary": "An overview of distributed systems, CAP tradeoffs, and practical patterns for resiliency.",
            "keyConcepts": [
                {"title": "Consensus Basics", "timestamp": "08:15"},
                {"title": "Replication", "timestamp": "17:42"},
                {"title": "Failure Modes", "timestamp": "31:09"},
            ],
            "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
            "created_at": now,
            "updated_at": now,
            "viewedBy": [],
        },
        {
            "slug": "cloud-native-architecture",
            "title": "Cloud Native Architecture",
            "description": "Designing resilient services with containers, service meshes, and observability.",
            "duration": "36:52",
            "image": "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1200&q=80",
            "publishedDate": "February 24, 2026",
            "views": "92 views",
            "aiSummary": "Explore container orchestration patterns and the building blocks of cloud native systems.",
            "keyConcepts": [
                {"title": "Containers", "timestamp": "05:20"},
                {"title": "Service Mesh", "timestamp": "18:03"},
                {"title": "Tracing", "timestamp": "27:11"},
            ],
            "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
            "created_at": now,
            "updated_at": now,
            "viewedBy": [],
        },
        {
            "slug": "ai-powered-learning",
            "title": "AI-Powered Learning",
            "description": "Using AI to personalize learning journeys and improve comprehension.",
            "duration": "28:07",
            "image": "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80",
            "publishedDate": "February 24, 2026",
            "views": "64 views",
            "aiSummary": "See how AI can recommend content, summarize lectures, and guide study plans.",
            "keyConcepts": [
                {"title": "Adaptive Paths", "timestamp": "06:48"},
                {"title": "Engagement Signals", "timestamp": "13:52"},
                {"title": "Outcome Metrics", "timestamp": "22:05"},
            ],
            "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
            "created_at": now,
            "updated_at": now,
            "viewedBy": [],
        },
        {
            "slug": "security-for-streaming",
            "title": "Security for Streaming Platforms",
            "description": "Protecting media content with authentication, authorization, and audit trails.",
            "duration": "33:40",
            "image": "https://images.unsplash.com/photo-1556155092-8707de31f9c4?auto=format&fit=crop&w=1200&q=80",
            "publishedDate": "February 24, 2026",
            "views": "41 views",
            "aiSummary": "A practical guide to securing content delivery pipelines and user access patterns.",
            "keyConcepts": [
                {"title": "Access Control", "timestamp": "09:05"},
                {"title": "Token Security", "timestamp": "18:47"},
                {"title": "Audit Logging", "timestamp": "27:33"},
            ],
            "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
            "created_at": now,
            "updated_at": now,
            "viewedBy": [],
        },
    ]

    await db.lectures.insert_many(demo_lectures)


@app.post("/api/seed-lectures")
async def seed_lectures_endpoint(
    overwrite: bool = False,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict[str, Any]:
    if overwrite:
        await db.lectures.delete_many({})

    await seed_demo_lectures(db)
    total = await db.lectures.count_documents({})
    return {"message": "Demo lectures seeded", "total": total}


@app.on_event("startup")
async def startup_db() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    client = AsyncIOMotorClient(MONGO_URL)
    app.state.db_client = client
    app.state.db = client[MONGO_DB_NAME]
    await seed_demo_lectures(app.state.db)


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
    title: str | None = Form(None),
    description: str | None = Form(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict[str, str]:
    # Validate the upload request early to fail fast and avoid unnecessary I/O.
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video")

    job_id = str(uuid.uuid4())[:8]
    formats = ["720p", "480p", "360p"]
    created_at = utcnow()

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is too large")

    sanitized_name = Path(file.filename or f"{job_id}.mp4").name
    file_path = UPLOAD_DIR / f"{job_id}_{sanitized_name}"

    try:
        file_path.write_bytes(contents)
    except OSError as error:
        logger.exception("Failed to persist file for job %s", job_id)
        raise HTTPException(status_code=500, detail="Could not persist uploaded file") from error

    title_value = (title or "").strip() or sanitized_name
    description_value = (description or "").strip() or "Uploaded lecture"
    lecture_slug = f"{slugify(title_value)}-{job_id}"

    job_doc = {
        "job_id": job_id,
        "filename": sanitized_name,
        "content_type": file.content_type,
        "title": title_value,
        "description": description_value,
        "status": "queued",
        "progress": 0.0,
        "formats": formats,
        "created_at": created_at,
        "updated_at": created_at,
        "file_path": str(file_path),
    }

    lecture_doc = {
        "slug": lecture_slug,
        "title": title_value,
        "description": description_value,
        "duration": "00:00",
        "image": "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
        "publishedDate": created_at.strftime("%B %d, %Y"),
        "views": "0 views",
        "aiSummary": "AI summary will be available after post-processing completes.",
        "keyConcepts": [],
        "videoUrl": f"/api/video/{job_id}",
        "created_at": created_at,
        "updated_at": created_at,
        "source_job_id": job_id,
        "viewedBy": [],
    }

    try:
        await db.jobs.insert_one(job_doc)
        await db.lectures.update_one(
            {"source_job_id": job_id},
            {"$set": lecture_doc},
            upsert=True,
        )
    except Exception as error:  # noqa: BLE001
        logger.exception("Failed to create job documents for %s", job_id)
        raise HTTPException(status_code=500, detail="Could not create upload job") from error

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


@app.get("/api/admin/dashboard-summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> DashboardSummary:
    active_jobs = await db.jobs.count_documents({"status": {"$in": ["queued", "processing"]}})
    completed_jobs = await db.jobs.count_documents({"status": "completed"})
    failed_jobs = await db.jobs.count_documents({"status": "failed"})
    total_lectures = await db.lectures.count_documents({})

    recent_jobs_cursor = db.jobs.find({}).sort("updated_at", -1).limit(8)
    recent_jobs: list[DashboardJob] = []
    async for job in recent_jobs_cursor:
        recent_jobs.append(
            DashboardJob(
                id=job["job_id"],
                filename=job.get("filename", "unknown"),
                status=job.get("status", "queued"),
                progress=float(job.get("progress", 0.0)),
                updatedAt=to_iso_string(job.get("updated_at")),
            )
        )

    return DashboardSummary(
        totalLectures=total_lectures,
        activeJobs=active_jobs,
        completedJobs=completed_jobs,
        failedJobs=failed_jobs,
        recentJobs=recent_jobs,
    )


@app.post("/api/jobs/{job_id}/retry")
async def retry_job(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict[str, str]:
    job_doc = await db.jobs.find_one({"job_id": job_id})
    if not job_doc:
        raise HTTPException(status_code=404, detail="Job not found")

    current_status = str(job_doc.get("status", "queued"))
    if current_status in {"queued", "processing"}:
        raise HTTPException(status_code=409, detail="Job is already in progress")

    await db.jobs.update_one(
        {"job_id": job_id},
        {
            "$set": {
                "status": "queued",
                "progress": 0.0,
                "updated_at": utcnow(),
            }
        },
    )

    asyncio.create_task(transcode(job_id))
    return {"message": "Retry started", "job_id": job_id}


async def _resolve_media_response(
    job_id: str,
    db: AsyncIOMotorDatabase,
) -> FileResponse:
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    file_path = job.get("file_path")
    if not file_path or not Path(file_path).exists():
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
                "updated_at": utcnow(),
            }
        },
    )

    return {"views": views_str}


@app.get("/api/lectures", response_model=list[Lecture])
async def list_lectures(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[Lecture]:
    cursor = db.lectures.find({}).sort("created_at", -1)
    results: list[Lecture] = []
    async for doc in cursor:
        results.append(lecture_from_doc(doc))
    return results


@app.get("/api/lectures/{slug}", response_model=Lecture)
async def get_lecture(
    slug: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Lecture:
    doc = await db.lectures.find_one({"slug": slug})
    if not doc:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return lecture_from_doc(doc)


@app.post("/api/lectures", response_model=Lecture)
async def create_lecture(
    lecture: Lecture,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Lecture:
    existing = await db.lectures.find_one({"slug": lecture.slug})
    if existing:
        raise HTTPException(status_code=409, detail="Lecture with this slug already exists")

    now = utcnow()
    doc = lecture.model_dump()
    doc["created_at"] = now
    doc["updated_at"] = now
    await db.lectures.insert_one(doc)
    return lecture


@app.put("/api/lectures/{slug}", response_model=Lecture)
async def update_lecture(
    slug: str,
    payload: LectureUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Lecture:
    existing = await db.lectures.find_one({"slug": slug})
    if not existing:
        raise HTTPException(status_code=404, detail="Lecture not found")

    updates = payload.model_dump(exclude_none=True)
    if not updates:
        return lecture_from_doc(existing)

    updates["updated_at"] = utcnow()
    await db.lectures.update_one({"slug": slug}, {"$set": updates})

    updated = await db.lectures.find_one({"slug": slug})
    if not updated:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return lecture_from_doc(updated)


@app.delete("/api/lectures/{slug}")
async def delete_lecture(
    slug: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict[str, str]:
    result = await db.lectures.delete_one({"slug": slug})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return {"message": "Lecture deleted"}


@app.get("/api/video/{job_id}")
async def stream_video(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> FileResponse:
    return await _resolve_media_response(job_id, db)


async def transcode(job_id: str) -> None:
    db = get_db()
    try:
        # This simulates long-running transcoding work and periodically updates progress.
        await db.jobs.update_one(
            {"job_id": job_id},
            {"$set": {"status": "processing", "updated_at": utcnow()}},
        )

        for progress_step in range(1, 11):
            await asyncio.sleep(2)
            progress_value = progress_step * 10
            await db.jobs.update_one(
                {"job_id": job_id},
                {
                    "$set": {
                        "progress": progress_value,
                        "updated_at": utcnow(),
                    }
                },
            )

        await db.jobs.update_one(
            {"job_id": job_id},
            {"$set": {"status": "completed", "progress": 100.0, "updated_at": utcnow()}},
        )
        logger.info("Job %s transcoding completed", job_id)
    except Exception:  # noqa: BLE001
        logger.exception("Job %s failed during transcoding", job_id)
        await db.jobs.update_one(
            {"job_id": job_id},
            {"$set": {"status": "failed", "updated_at": utcnow()}},
        )
