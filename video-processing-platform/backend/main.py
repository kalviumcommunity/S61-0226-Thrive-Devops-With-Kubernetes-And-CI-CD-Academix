import asyncio
import logging
import os
import re
import subprocess
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
import google.generativeai as genai
from pydantic import BaseModel
from dotenv import load_dotenv

# new imports for metadata extraction
import json

load_dotenv()

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("video-api")

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "video_platform")
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads")))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(1024 * 1024 * 1024)))
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
EXECUTOR = ThreadPoolExecutor(max_workers=4)

if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    client = AsyncIOMotorClient(MONGO_URL)
    app.state.db_client = client
    app.state.db = client[MONGO_DB_NAME]
    await seed_demo_lectures(app.state.db)
    await enrich_existing_lectures(app.state.db)
    yield
    # shutdown
    client = getattr(app.state, "db_client", None)
    if client is not None:
        client.close()

app = FastAPI(title="Video Processing API", version="1.1.0", lifespan=lifespan)

# --- progress websocket manager -----------------------------------------
class ProgressConnectionManager:
    def __init__(self):
        # key is (slug, user_id)
        self.active: dict[tuple[str, str], set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, slug: str, user_id: str) -> None:
        await websocket.accept()
        key = (slug, user_id)
        self.active.setdefault(key, set()).add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        for key, conns in list(self.active.items()):
            if websocket in conns:
                conns.remove(websocket)
                if not conns:
                    del self.active[key]

    async def send_progress(self, slug: str, user_id: str, seconds: float) -> None:
        key = (slug, user_id)
        conns = self.active.get(key, set())
        if not conns:
            return
        message = json.dumps({"progress": seconds})
        to_remove = []
        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception:
                to_remove.append(ws)
        for ws in to_remove:
            self.disconnect(ws)

progress_manager = ProgressConnectionManager()

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


class TranscriptSegment(BaseModel):
    timestamp: str
    text: str


class Lecture(BaseModel):
    slug: str
    title: str
    description: str
    duration: str
    # numeric seconds parsed from `duration` string, helpful for progress bars
    durationSeconds: float | None = None
    image: str
    publishedDate: str
    views: str
    aiSummary: str
    keyConcepts: list[KeyConcept]
    videoUrl: str | None = None
    transcript: list[TranscriptSegment] = []
    # map of userId -> seconds watched
    progress: dict[str, float] = {}


class ViewPayload(BaseModel):
    userId: str


class ProgressPayload(BaseModel):
    userId: str
    seconds: float


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
    transcript: list[TranscriptSegment] | None = None


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
    # compute numeric seconds for convenience
    dur_secs: float | None = None
    if "duration" in doc and isinstance(doc.get("duration"), str):
        try:
            dur_secs = parse_duration_to_seconds(doc["duration"])
        except Exception:  # silent fallback
            dur_secs = None

    return Lecture(
        slug=doc["slug"],
        title=doc["title"],
        description=doc["description"],
        duration=doc["duration"],
        durationSeconds=dur_secs,
        image=doc["image"],
        publishedDate=doc["publishedDate"],
        views=doc["views"],
        aiSummary=doc["aiSummary"],
        keyConcepts=[
            KeyConcept(title=item["title"], timestamp=item["timestamp"])
            for item in doc.get("keyConcepts", [])
        ],
        videoUrl=doc.get("videoUrl"),
        transcript=[
            TranscriptSegment(timestamp=item["timestamp"], text=item["text"])
            for item in doc.get("transcript", [])
        ],
        progress={
            str(k): float(v)
            for k, v in (doc.get("progress") or {}).items()
        },
    )


def to_iso_string(value: Any) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.isoformat()
    return utcnow().isoformat()


def format_duration(seconds: float) -> str:
    total_seconds = max(0, int(round(seconds)))
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def _run_subprocess(command: list[str]) -> str:
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError) as e:
        logger.warning("subprocess failed %s: %s", command, e)
        return ""


def extract_video_metadata(file_path: Path) -> dict[str, Any]:
    """Use ffprobe to pull resolution, duration and filesize."""
    try:
        output = _run_subprocess([
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(file_path),
        ])
        if not output:
            return {}
        data = json.loads(output)
        fmt = data.get("format", {})
        streams = data.get("streams", [])
        video_stream = next((s for s in streams if s.get("codec_type") == "video"), {})
        return {
            "width": video_stream.get("width"),
            "height": video_stream.get("height"),
            "duration": float(fmt.get("duration", 0)) if fmt.get("duration") else None,
            "size": int(fmt.get("size", 0)) if fmt.get("size") else None,
        }
    except Exception as e:  # pragma: no cover
        logger.warning("failed to extract metadata: %s", e)
        return {}


def extract_duration_seconds(file_path: Path) -> float:
    output = _run_subprocess(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(file_path),
        ]
    )
    if not output:
        return 0.0
    try:
        return float(output)
    except ValueError:
        return 0.0


def generate_thumbnail(file_path: Path, thumbnail_path: Path) -> bool:
    thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
    output = _run_subprocess(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(file_path),
            "-ss",
            "00:00:02",
            "-frames:v",
            "1",
            str(thumbnail_path),
        ]
    )
    return thumbnail_path.exists() and bool(output is not None)


def _sentence_chunks(text: str) -> list[str]:
    segments = [segment.strip() for segment in re.split(r"[.!?]+", text) if segment.strip()]
    return segments[:6]


def build_transcript(title: str, description: str, duration_seconds: float) -> list[dict[str, str]]:
    chunks = _sentence_chunks(description)
    if not chunks:
        chunks = [
            f"Welcome to {title}.",
            "In this section we review core ideas and practical examples.",
            "We summarize the implementation details and next actions.",
        ]

    section_count = max(3, min(6, len(chunks)))
    safe_duration = max(180, int(duration_seconds) if duration_seconds > 0 else 180)
    interval = max(20, safe_duration // section_count)

    transcript: list[dict[str, str]] = []
    for index in range(section_count):
        timestamp = format_duration(index * interval)
        source_text = chunks[index] if index < len(chunks) else chunks[-1]
        transcript.append({"timestamp": timestamp, "text": source_text})

    return transcript


def build_key_concepts(title: str, transcript: list[dict[str, str]]) -> list[dict[str, str]]:
    words = [word for word in re.split(r"\W+", title) if len(word) > 2]
    base_concepts = words[:3]
    if not base_concepts:
        base_concepts = ["Introduction", "Core Idea", "Practical Takeaway"]

    concepts: list[dict[str, str]] = []
    for index, word in enumerate(base_concepts):
        concept_title = word.title() if word.lower() not in {"and", "for", "the"} else f"Concept {index + 1}"
        timestamp = transcript[index]["timestamp"] if index < len(transcript) else format_duration(index * 60)
        concepts.append({"title": concept_title, "timestamp": timestamp})

    return concepts


async def generate_ai_summary(title: str, description: str, transcript: list[dict[str, str]]) -> str:
    if not GOOGLE_API_KEY:
        return f"{title} covers practical concepts with a timestamped transcript for reference."

    try:
        transcript_text = " ".join([seg.get("text", "") for seg in transcript])
        prompt = f"""You are an expert educational content analyst. Create a concise, engaging 2-3 sentence summary for this lecture.

Title: {title}
Description: {description}
Transcript excerpt: {transcript_text[:1000]}

Summary (2-3 sentences, engaging and informative):"""

        loop = asyncio.get_event_loop()
        def call_genai():
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content(prompt)
            return response.text.strip()
        
        result = await asyncio.wait_for(loop.run_in_executor(EXECUTOR, call_genai), timeout=30)
        return result if result else f"{title} covers practical concepts with a timestamped transcript for reference."
    except Exception as e:
        logger.warning("AI summary generation failed for %s: %s", title, e)
        return f"{title} covers practical concepts with a timestamped transcript for reference."


async def generate_ai_transcript(title: str, description: str, duration_seconds: float) -> list[dict[str, str]]:
    if not GOOGLE_API_KEY:
        return build_transcript(title, description, duration_seconds)

    try:
        prompt = f"""Create a detailed educational transcript for a {int(duration_seconds / 60)}-minute lecture.

Title: {title}
Description: {description}

Generate 4-6 timestamped segments at regular intervals. Each segment should:
- Start with timestamp in MM:SS format
- Contain 1-2 sentences of engaging, educational content
- Progress logically through the topic

Format each line as: [MM:SS] Content here

Transcript:"""

        loop = asyncio.get_event_loop()
        def call_genai():
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content(prompt)
            return response.text.strip()
        
        transcript_text = await asyncio.wait_for(loop.run_in_executor(EXECUTOR, call_genai), timeout=30)
        transcript: list[dict[str, str]] = []

        for line in transcript_text.split("\n"):
            line = line.strip()
            if not line or "[" not in line:
                continue
            try:
                timestamp_end = line.index("]")
                timestamp = line[1:timestamp_end].strip()
                text = line[timestamp_end + 1 :].strip()
                if timestamp and text:
                    transcript.append({"timestamp": timestamp, "text": text})
            except (ValueError, IndexError):
                continue

        if not transcript:
            return build_transcript(title, description, duration_seconds)
        return transcript
    except Exception as e:
        logger.warning("AI transcript generation failed for %s: %s", title, e)
        return build_transcript(title, description, duration_seconds)


async def generate_ai_segment_summary(title: str, description: str, snippet: str) -> str:
    """Use AI to summarize a small excerpt of the lecture text."""
    if not GOOGLE_API_KEY:
        return "(live summary unavailable)"
    try:
        prompt = f"Provide a succinct, engaging two-sentence summary for the following segment of a lecture titled '{title}':\n\n{snippet}\n\nSummary:" 
        loop = asyncio.get_event_loop()
        def call_genai():
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content(prompt)
            return response.text.strip()
        result = await asyncio.wait_for(loop.run_in_executor(EXECUTOR, call_genai), timeout=20)
        return result or "(live summary unavailable)"
    except Exception as e:
        logger.warning("live summary generation failed: %s", e)
        return "(live summary unavailable)"


async def generate_ai_key_concepts(title: str, transcript: list[dict[str, str]]) -> list[dict[str, str]]:
    if not GOOGLE_API_KEY:
        return build_key_concepts(title, transcript)

    try:
        transcript_text = " ".join([seg.get("text", "") for seg in transcript])
        prompt = f"""Analyze this lecture and identify 3-4 key concepts/topics that students should focus on.

Title: {title}
Transcript: {transcript_text[:800]}

For each concept, provide:
1. A clear, concise concept name (2-4 words)
2. The most relevant timestamp from the transcript

Format: [HH:MM:SS or MM:SS] Concept Name

Key Concepts:"""

        loop = asyncio.get_event_loop()
        def call_genai():
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content(prompt)
            return response.text.strip()
        
        concepts_text = await asyncio.wait_for(loop.run_in_executor(EXECUTOR, call_genai), timeout=30)
        concepts: list[dict[str, str]] = []

        for line in concepts_text.split("\n"):
            line = line.strip()
            if not line or "[" not in line:
                continue
            try:
                timestamp_end = line.index("]")
                timestamp = line[1:timestamp_end].strip()
                title_text = line[timestamp_end + 1 :].strip()
                if timestamp and title_text:
                    concepts.append({"title": title_text, "timestamp": timestamp})
            except (ValueError, IndexError):
                continue

        if not concepts:
            return build_key_concepts(title, transcript)
        return concepts[:4]
    except Exception as e:
        logger.warning("AI key concepts generation failed for %s: %s", title, e)
        return build_key_concepts(title, transcript)


def parse_duration_to_seconds(value: str) -> float:
    parts = [part for part in value.split(":") if part.isdigit()]
    if len(parts) == 2:
        minutes, seconds = map(int, parts)
        return float(minutes * 60 + seconds)
    if len(parts) == 3:
        hours, minutes, seconds = map(int, parts)
        return float(hours * 3600 + minutes * 60 + seconds)
    return 0.0


def estimate_duration_seconds_from_text(
    transcript: list[dict[str, str]] | None,
    description: str,
    title: str,
) -> float:
    words = 0
    for segment in transcript or []:
        words += len(str(segment.get("text", "")).split())

    if words == 0:
        words = len(description.split()) + len(title.split())

    if words == 0:
        return 180.0

    estimated_seconds = (words / 130.0) * 60.0
    return max(180.0, estimated_seconds)


async def enrich_existing_lectures(db: AsyncIOMotorDatabase) -> None:
    cursor = db.lectures.find({})
    async for lecture in cursor:
        slug = lecture.get("slug")
        if not slug:
            continue

        title = str(lecture.get("title", "Lecture"))
        description = str(lecture.get("description", "Uploaded lecture"))
        existing_duration = str(lecture.get("duration", "00:00"))
        duration_seconds = parse_duration_to_seconds(existing_duration)

        source_job_id = lecture.get("source_job_id")
        thumbnail_rel = str(lecture.get("image", "") or "")

        if source_job_id:
            job_doc = await db.jobs.find_one({"job_id": source_job_id})
            file_path = Path(job_doc.get("file_path", "")) if job_doc else None
            if file_path and file_path.exists():
                probed_seconds = extract_duration_seconds(file_path)
                if probed_seconds > 0:
                    duration_seconds = probed_seconds
                thumbnail_path = UPLOAD_DIR / "thumbnails" / f"{source_job_id}.jpg"
                if generate_thumbnail(file_path, thumbnail_path):
                    thumbnail_rel = f"/api/video/{source_job_id}/thumbnail"

        if duration_seconds <= 0:
            duration_seconds = estimate_duration_seconds_from_text(
                lecture.get("transcript") if isinstance(lecture.get("transcript"), list) else None,
                description,
                title,
            )

        transcript = lecture.get("transcript")
        if not isinstance(transcript, list) or len(transcript) == 0:
            transcript = await generate_ai_transcript(title, description, duration_seconds)

        key_concepts = lecture.get("keyConcepts")
        if not isinstance(key_concepts, list) or len(key_concepts) == 0:
            key_concepts = await generate_ai_key_concepts(title, transcript)

        # always regenerate summary to ensure accurate content
        logger.info(f"Generating AI summary for {slug}")
        ai_summary = await generate_ai_summary(title, description, transcript)

        update_payload = {
            "duration": format_duration(duration_seconds) if duration_seconds > 0 else existing_duration,
            "image": thumbnail_rel,
            "transcript": transcript,
            "keyConcepts": key_concepts,
            "aiSummary": ai_summary,
            "updated_at": utcnow(),
        }

        await db.lectures.update_one({"slug": slug}, {"$set": update_payload})
        logger.info(f"Updated lecture {slug} with AI metadata")


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
            "transcript": [
                {"timestamp": "00:00", "text": "We introduce distributed systems and why they are needed for scale."},
                {"timestamp": "08:15", "text": "Consensus is required when multiple nodes must agree on state."},
                {"timestamp": "17:42", "text": "Replication improves availability but introduces consistency trade-offs."},
                {"timestamp": "31:09", "text": "Failure modes are analyzed to design resilient system behavior."},
            ],
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
            "transcript": [
                {"timestamp": "00:00", "text": "Cloud native architecture starts with containerized services."},
                {"timestamp": "05:20", "text": "Containers make deployment predictable and portable."},
                {"timestamp": "18:03", "text": "Service meshes add traffic policy, retries, and observability."},
                {"timestamp": "27:11", "text": "Tracing reveals latency bottlenecks across distributed services."},
            ],
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
            "transcript": [
                {"timestamp": "00:00", "text": "AI can personalize learning experiences for different student profiles."},
                {"timestamp": "06:48", "text": "Adaptive paths adjust pacing and content recommendations in real time."},
                {"timestamp": "13:52", "text": "Engagement signals help identify where students need support."},
                {"timestamp": "22:05", "text": "Outcome metrics measure how personalized strategies improve retention."},
            ],
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
            "transcript": [
                {"timestamp": "00:00", "text": "Streaming security starts with strong identity and access management."},
                {"timestamp": "09:05", "text": "Access control policies should map clearly to user roles."},
                {"timestamp": "18:47", "text": "Short-lived tokens reduce the impact of leaked credentials."},
                {"timestamp": "27:33", "text": "Audit logs provide traceability for compliance and incident response."},
            ],
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
        "image": "",
        "publishedDate": created_at.strftime("%B %d, %Y"),
        "views": "0 views",
        "aiSummary": "AI summary will be available after post-processing completes.",
        "keyConcepts": [],
        "videoUrl": f"/api/video/{job_id}",
        "transcript": [],
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


@app.post("/api/lectures/{slug}/progress")
async def update_progress(
    slug: str,
    payload: ProgressPayload,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict[str, Any]:
    lecture_doc = await db.lectures.find_one({"slug": slug})
    if not lecture_doc:
        raise HTTPException(status_code=404, detail="Lecture not found")

    progress_map = lecture_doc.get("progress", {}) or {}
    progress_map[payload.userId] = payload.seconds
    await db.lectures.update_one(
        {"slug": slug},
        {"$set": {"progress": progress_map, "updated_at": utcnow()}},
    )

    # push update to websocket listeners if any
    try:
        await progress_manager.send_progress(slug, payload.userId, payload.seconds)
    except Exception:
        pass

    return {"progress": payload.seconds}


@app.get("/api/lectures/{slug}/progress/{user_id}")
async def get_progress(
    slug: str,
    user_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict[str, Any]:
    lecture_doc = await db.lectures.find_one({"slug": slug})
    if not lecture_doc:
        raise HTTPException(status_code=404, detail="Lecture not found")

    progress_map = lecture_doc.get("progress", {}) or {}
    seconds = float(progress_map.get(user_id, 0.0))
    return {"progress": seconds}


@app.get("/api/lectures/{slug}/search")
async def search_transcript(
    slug: str,
    q: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict[str, Any]:
    lecture_doc = await db.lectures.find_one({"slug": slug})
    if not lecture_doc:
        raise HTTPException(status_code=404, detail="Lecture not found")
    matches = []
    for seg in lecture_doc.get("transcript", []):
        if q.lower() in seg.get("text", "").lower():
            matches.append(seg)
    return {"matches": matches}


@app.get("/api/lectures/{slug}/transcript/export")
async def export_transcript(
    slug: str,
    format: str = "txt",
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Response:
    lecture_doc = await db.lectures.find_one({"slug": slug})
    if not lecture_doc:
        raise HTTPException(status_code=404, detail="Lecture not found")
    transcript = lecture_doc.get("transcript", [])
    if format == "txt":
        content = "\n".join(f"{seg.get('timestamp','')} {seg.get('text','')}" for seg in transcript)
        return Response(content, media_type="text/plain", headers={"Content-Disposition": f"attachment; filename={slug}.txt"})
    elif format == "srt":
        lines = []
        for i, seg in enumerate(transcript, start=1):
            lines.append(str(i))
            lines.append(f"00:{seg.get('timestamp','')}" if seg.get('timestamp','').count(':')==1 else seg.get('timestamp',''))
            lines.append(seg.get('text',''))
            lines.append("")
        content = "\n".join(lines)
        return Response(content, media_type="application/x-subrip", headers={"Content-Disposition": f"attachment; filename={slug}.srt"})
    elif format == "vtt":
        # WebVTT requires cues with start --> end timestamps
        def to_vtt_time(value: Any) -> str:
            # accepts either timestamp string or numeric seconds
            if isinstance(value, (int, float)):
                secs = float(value)
            else:
                secs = parse_duration_to_seconds(str(value))
            hours = int(secs // 3600)
            mins = int((secs % 3600) // 60)
            sec = int(secs % 60)
            millis = int((secs - int(secs)) * 1000)
            if hours > 0:
                return f"{hours:02d}:{mins:02d}:{sec:02d}.{millis:03d}"
            return f"{mins:02d}:{sec:02d}.{millis:03d}"

        vtt_lines = ["WEBVTT", ""]
        for idx, seg in enumerate(transcript):
            start = to_vtt_time(seg.get("timestamp", "0:00"))
            # determine end time as next segment or +5s
            if idx + 1 < len(transcript):
                end = to_vtt_time(transcript[idx + 1].get("timestamp", "0:00"))
            else:
                end = to_vtt_time(parse_duration_to_seconds(seg.get("timestamp", "0:00")) + 5)
            vtt_lines.append(f"{start} --> {end}")
            vtt_lines.append(seg.get("text", ""))
            vtt_lines.append("")
        content = "\n".join(vtt_lines)
        return Response(content, media_type="text/vtt", headers={"Content-Disposition": f"attachment; filename={slug}.vtt"})
    else:
        raise HTTPException(status_code=400, detail="Unsupported format")


@app.get("/api/lectures", response_model=list[Lecture])
async def list_lectures(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[Lecture]:
    cursor = db.lectures.find({}).sort("created_at", -1)
    results: list[Lecture] = []
    async for doc in cursor:
        results.append(lecture_from_doc(doc))
    return results


@app.get("/api/lectures/{slug}/key-concepts")
async def get_key_concepts(
    slug: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict[str, Any]:
    doc = await db.lectures.find_one({"slug": slug})
    if not doc:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return {"keyConcepts": doc.get("keyConcepts", [])}


@app.get("/api/lectures/{slug}/live-summary")
async def live_summary(
    slug: str,
    timestamp: float,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict[str, Any]:
    """Return a short AI-generated summary around the given timestamp."""
    doc = await db.lectures.find_one({"slug": slug})
    if not doc:
        raise HTTPException(status_code=404, detail="Lecture not found")
    transcript = doc.get("transcript", [])
    # find nearest segment
    nearest = None
    mindiff = float("inf")
    for seg in transcript:
        seg_secs = parse_duration_to_seconds(seg.get("timestamp", "0:00"))
        diff = abs(seg_secs - timestamp)
        if diff < mindiff:
            mindiff = diff
            nearest = seg
    snippet = "" if nearest is None else nearest.get("text", "")
    summary = await generate_ai_segment_summary(doc.get("title", "Lecture"), doc.get("description", ""), snippet)
    return {"summary": summary}


@app.get("/api/lectures/{slug}/live-concepts")
async def live_concepts(
    slug: str,
    timestamp: float,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict[str, Any]:
    """Return a few AI-generated key concepts around the current timestamp."""
    doc = await db.lectures.find_one({"slug": slug})
    if not doc:
        raise HTTPException(status_code=404, detail="Lecture not found")
    transcript = doc.get("transcript", [])
    # choose 3 segments around timestamp
    segments: list[str] = []
    for seg in transcript:
        if abs(parse_duration_to_seconds(seg.get("timestamp", "0:00")) - timestamp) <= 60:
            segments.append(seg.get("text", ""))
    text_block = " ".join(segments)
    concepts = await generate_ai_key_concepts(doc.get("title", "Lecture"), [{"timestamp": "", "text": text_block}])
    return {"keyConcepts": concepts}


@app.websocket("/ws/progress/{slug}/{user_id}")
async def ws_progress(websocket: WebSocket, slug: str, user_id: str):
    await progress_manager.connect(websocket, slug, user_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        progress_manager.disconnect(websocket)


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




@app.post("/api/lectures/{slug}/ai-transcript")
async def regenerate_ai_transcript(
    slug: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict[str, Any]:
    """Trigger AI-powered transcript generation for a lecture.

    This will overwrite the stored transcript and return the new segments.
    """
    doc = await db.lectures.find_one({"slug": slug})
    if not doc:
        raise HTTPException(status_code=404, detail="Lecture not found")

    title = str(doc.get("title", "Lecture"))
    description = str(doc.get("description", ""))
    duration_seconds = parse_duration_to_seconds(str(doc.get("duration", "0:00")))

    transcript = await generate_ai_transcript(title, description, duration_seconds)
    await db.lectures.update_one(
        {"slug": slug},
        {"$set": {"transcript": transcript, "updated_at": utcnow()}},
    )
    return {"transcript": transcript}


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


@app.get("/api/video/{job_id}/thumbnail")
async def stream_video_thumbnail(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> FileResponse:
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    thumbnail_path = UPLOAD_DIR / "thumbnails" / f"{job_id}.jpg"
    if not thumbnail_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not found")

    return FileResponse(path=thumbnail_path, media_type="image/jpeg", filename=f"{job_id}.jpg")


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

        job_doc = await db.jobs.find_one({"job_id": job_id})
        file_path = Path(job_doc.get("file_path", "")) if job_doc else None
        title = str(job_doc.get("title", "Lecture")) if job_doc else "Lecture"
        description = str(job_doc.get("description", "Uploaded lecture")) if job_doc else "Uploaded lecture"

        duration_seconds = extract_duration_seconds(file_path) if file_path and file_path.exists() else 0.0
        duration_formatted = format_duration(duration_seconds) if duration_seconds > 0 else "00:00"

        # pull full metadata (width/height/size) if ffprobe is available
        metadata = {}
        if file_path and file_path.exists():
            metadata = extract_video_metadata(file_path)

        transcript = await generate_ai_transcript(title, description, duration_seconds)
        key_concepts = await generate_ai_key_concepts(title, transcript)
        ai_summary = await generate_ai_summary(title, description, transcript)

        thumbnail_rel = ""
        if file_path and file_path.exists():
            thumbnail_path = UPLOAD_DIR / "thumbnails" / f"{job_id}.jpg"
            if generate_thumbnail(file_path, thumbnail_path):
                thumbnail_rel = f"/api/video/{job_id}/thumbnail"

        update_fields: dict[str, Any] = {
            "duration": duration_formatted,
            "image": thumbnail_rel,
            "transcript": transcript,
            "keyConcepts": key_concepts,
            "aiSummary": ai_summary,
            "updated_at": utcnow(),
        }
        if metadata:
            update_fields["metadata"] = metadata

        await db.lectures.update_one(
            {"source_job_id": job_id},
            {"$set": update_fields},
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
