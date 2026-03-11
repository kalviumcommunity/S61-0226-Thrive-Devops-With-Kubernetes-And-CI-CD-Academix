import asyncio
import logging
import os
import re
import subprocess
import uuid
from collections import defaultdict, deque
from time import perf_counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect, Response, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
import google.generativeai as genai
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from pydantic import BaseModel
from dotenv import load_dotenv

# new imports for metadata extraction
import json

load_dotenv()


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("video-api")

HTTP_REQUESTS_TOTAL = Counter(
    "video_api_http_requests_total",
    "Total HTTP requests processed by the video API.",
    ["method", "path", "status"],
)

HTTP_REQUEST_ERRORS_TOTAL = Counter(
    "video_api_http_request_errors_total",
    "Total HTTP requests ending with server error status codes.",
    ["method", "path"],
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "video_api_http_request_duration_seconds",
    "HTTP request processing time in seconds.",
    ["method", "path"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

HTTP_REQUESTS_IN_FLIGHT = Gauge(
    "video_api_http_requests_in_flight",
    "Current number of in-flight HTTP requests.",
)


def _build_observability_store() -> dict[str, Any]:
    return {
        "requests_total": 0,
        "errors_total": 0,
        "status_counts": defaultdict(int),
        "path_counts": defaultdict(int),
        "latency_ms_recent": deque(maxlen=500),
        "started_at": utcnow().isoformat(),
    }


def _record_request_observation(path: str, status_code: int, latency_ms: float) -> None:
    store = getattr(app.state, "observability", None)
    if store is None:
        store = _build_observability_store()
        app.state.observability = store

    store["requests_total"] += 1
    store["status_counts"][str(status_code)] += 1
    store["path_counts"][path] += 1
    store["latency_ms_recent"].append(round(latency_ms, 2))
    if status_code >= 500:
        store["errors_total"] += 1


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    idx = int(round((percentile / 100.0) * (len(sorted_values) - 1)))
    return round(sorted_values[idx], 2)

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "video_platform")
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads")))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(1024 * 1024 * 1024)))
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
ENABLE_AI_SUMMARY = os.getenv("ENABLE_AI_SUMMARY", "true").lower() == "true"
ENABLE_LIVE_SUMMARY = os.getenv("ENABLE_LIVE_SUMMARY", "true").lower() == "true"
EXECUTOR = ThreadPoolExecutor(max_workers=4)

KNOWN_SAMPLE_VIDEO_METADATA: dict[str, dict[str, Any]] = {
    "BigBuckBunny.mp4": {
        "title": "Big Buck Bunny",
        "description": "A laid-back rabbit enjoys a peaceful morning in the forest until three mischievous rodents start harassing the smaller animals around him.",
        "duration": "09:56",
        "image": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg",
        "aiSummary": "Big Buck Bunny is a short animated comedy that contrasts a calm forest morning with a string of escalating slapstick pranks. The story follows the rabbit from patient observer to clever avenger as he turns the bullies' chaos back on them.",
        "keyConcepts": [
            {"title": "Peaceful Opening", "timestamp": "00:00"},
            {"title": "Bullies Arrive", "timestamp": "01:45"},
            {"title": "Payback Setup", "timestamp": "05:40"},
            {"title": "Final Gag", "timestamp": "08:48"},
        ],
        "transcript": [
            {"timestamp": "00:00", "text": "Opening scene: Big Buck Bunny enjoys butterflies, birds, and the calm rhythm of the forest."},
            {"timestamp": "01:45", "text": "Inciting moment: Three tiny rodents appear and start tormenting other animals for fun."},
            {"timestamp": "03:25", "text": "Escalation: The pranksters begin targeting the bunny as well, turning the peaceful setting into slapstick chaos."},
            {"timestamp": "05:40", "text": "Preparation: After taking the abuse in silence, the bunny methodically turns the forest into a trap-filled revenge plan."},
            {"timestamp": "07:20", "text": "Reversal: Each trap lands in sequence and the bullies get hit by the same kind of mayhem they created."},
            {"timestamp": "08:48", "text": "Closing beat: The short ends with one final visual joke that completes the bunny's comic payback."},
        ],
    },
    "ElephantsDream.mp4": {
        "title": "Elephants Dream",
        "description": "Two travelers move through a surreal machine world while an older guide pushes a younger companion to accept his increasingly distorted view of reality.",
        "duration": "10:53",
        "image": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg",
        "aiSummary": "Elephants Dream is a surreal animated short about perspective, control, and the instability of memory inside a giant mechanical labyrinth. The film contrasts Proog's obsession with Emo's uncertainty until the imagined order of the world finally breaks apart.",
        "keyConcepts": [
            {"title": "Machine World", "timestamp": "00:00"},
            {"title": "Proog's Control", "timestamp": "02:10"},
            {"title": "Emo's Doubt", "timestamp": "05:35"},
            {"title": "Reality Fractures", "timestamp": "08:50"},
        ],
        "transcript": [
            {"timestamp": "00:00", "text": "Opening scene: Proog leads Emo through an enormous and dreamlike mechanical environment full of moving structures."},
            {"timestamp": "02:10", "text": "Character dynamic: Proog speaks with certainty about the world around them and treats the machinery as something he understands and controls."},
            {"timestamp": "05:35", "text": "Tension grows: Emo reacts with hesitation and confusion, suggesting that Proog's explanations do not fully match what is happening."},
            {"timestamp": "07:25", "text": "Psychological shift: The journey becomes less about navigation and more about whether the machine world reflects obsession, memory, or delusion."},
            {"timestamp": "08:50", "text": "Climax: The fragile logic holding Proog's reality together starts to collapse, exposing the instability of his worldview."},
            {"timestamp": "10:10", "text": "Closing beat: The short ends on ambiguity, leaving the viewer with questions about control, trust, and perception."},
        ],
    },
    "Sintel.mp4": {
        "title": "Sintel",
        "description": "A young woman travels through harsh terrain while searching for a dragon she once rescued, driven by loyalty, grief, and incomplete memories.",
        "duration": "14:48",
        "image": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg",
        "aiSummary": "Sintel is an animated fantasy short that follows a lone traveler on a difficult search for the dragon she calls Scales. What begins as a rescue story turns tragic as the journey reveals how memory and loss have reshaped her understanding of the past.",
        "keyConcepts": [
            {"title": "Wilderness Journey", "timestamp": "00:00"},
            {"title": "Scales Backstory", "timestamp": "03:40"},
            {"title": "Mountain Search", "timestamp": "08:20"},
            {"title": "Tragic Reveal", "timestamp": "13:10"},
        ],
        "transcript": [
            {"timestamp": "00:00", "text": "Opening scene: Sintel pushes through snow and ruins, clearly exhausted but still focused on reaching her destination."},
            {"timestamp": "03:40", "text": "Backstory: Flashbacks show how she found an injured baby dragon, cared for it, and formed a close bond with it."},
            {"timestamp": "06:10", "text": "Loss and pursuit: After the dragon is taken, Sintel commits herself to a long and dangerous search to bring it back."},
            {"timestamp": "08:20", "text": "Escalation: The journey intensifies as she climbs into hostile terrain and faces larger threats connected to the dragon's world."},
            {"timestamp": "11:30", "text": "Confrontation: Sintel reaches the dragon she has been hunting, but the encounter does not unfold the way she expects."},
            {"timestamp": "13:10", "text": "Revelation: The ending reframes the entire quest through grief and memory, giving the story its tragic emotional payoff."},
        ],
    },
    "TearsOfSteel.mp4": {
        "title": "Tears of Steel",
        "description": "A small team in a futuristic Amsterdam uses improvised science and emotional history to confront giant robots threatening the city.",
        "duration": "12:14",
        "image": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg",
        "aiSummary": "Tears of Steel blends romance, science fiction, and action as a team tries to stop a robotic attack in near-future Amsterdam. The film ties its spectacle to a personal conflict, using a risky time-based intervention to resolve both the invasion and an unfinished relationship.",
        "keyConcepts": [
            {"title": "Robot Threat", "timestamp": "00:00"},
            {"title": "Team Regroups", "timestamp": "03:00"},
            {"title": "Time Hack Plan", "timestamp": "07:10"},
            {"title": "Final Confrontation", "timestamp": "10:35"},
        ],
        "transcript": [
            {"timestamp": "00:00", "text": "Opening scene: Amsterdam is under attack by giant robots, establishing the film's high-stakes science-fiction setting."},
            {"timestamp": "03:00", "text": "Team setup: A small group of specialists regathers and reconnects around a plan to neutralize the machines."},
            {"timestamp": "05:10", "text": "Personal conflict: The mission is complicated by unresolved tension between key characters whose history still shapes their choices."},
            {"timestamp": "07:10", "text": "Strategy shift: The group decides to use a precise time-based intervention instead of brute force to stop the attack."},
            {"timestamp": "09:05", "text": "Execution: The plan moves into action as technology, timing, and emotional stakes converge in the same moment."},
            {"timestamp": "10:35", "text": "Resolution: The final confrontation connects the robot threat to the characters' relationship, closing the story on both action and emotion."},
        ],
    },
}


def get_known_sample_video_metadata(video_url: str | None) -> dict[str, Any] | None:
    if not video_url:
        return None

    parsed = urlparse(video_url)
    video_name = Path(parsed.path).name
    if not video_name:
        return None

    profile = KNOWN_SAMPLE_VIDEO_METADATA.get(video_name)
    if not profile:
        return None

    return json.loads(json.dumps(profile))

if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    app.state.liveness_ok = True
    app.state.readiness_ok = True
    app.state.observability = _build_observability_store()
    client = AsyncIOMotorClient(MONGO_URL)
    app.state.db_client = client
    app.state.db = client[MONGO_DB_NAME]
    await ensure_db_indexes(app.state.db)
    await seed_demo_lectures(app.state.db)
    await enrich_existing_lectures(app.state.db)
    yield
    # shutdown
    client = getattr(app.state, "db_client", None)
    if client is not None:
        client.close()

app = FastAPI(title="Video Processing API", version="1.1.0", lifespan=lifespan)


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    start = perf_counter()
    path = request.url.path
    method = request.method
    HTTP_REQUESTS_IN_FLIGHT.inc()

    try:
        response = await call_next(request)
        status_code = response.status_code
    except Exception:
        latency_seconds = perf_counter() - start
        latency_ms = latency_seconds * 1000
        _record_request_observation(path=path, status_code=500, latency_ms=latency_ms)
        HTTP_REQUESTS_TOTAL.labels(method=method, path=path, status="500").inc()
        HTTP_REQUEST_ERRORS_TOTAL.labels(method=method, path=path).inc()
        HTTP_REQUEST_DURATION_SECONDS.labels(method=method, path=path).observe(latency_seconds)
        logger.exception(
            "request_failed request_id=%s method=%s path=%s status=500 latency_ms=%.2f",
            request_id,
            method,
            path,
            latency_ms,
        )
        raise
    finally:
        HTTP_REQUESTS_IN_FLIGHT.dec()

    latency_seconds = perf_counter() - start
    latency_ms = latency_seconds * 1000
    _record_request_observation(path=path, status_code=status_code, latency_ms=latency_ms)
    HTTP_REQUESTS_TOTAL.labels(method=method, path=path, status=str(status_code)).inc()
    if status_code >= 500:
        HTTP_REQUEST_ERRORS_TOTAL.labels(method=method, path=path).inc()
    HTTP_REQUEST_DURATION_SECONDS.labels(method=method, path=path).observe(latency_seconds)
    logger.info(
        "request_complete request_id=%s method=%s path=%s status=%s latency_ms=%.2f",
        request_id,
        method,
        path,
        status_code,
        latency_ms,
    )
    response.headers["X-Request-ID"] = request_id
    return response

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
    allow_origins=["*"],
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
    filename: str | None = None
    isDeleted: bool = False
    lastAction: str = "linked"  


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
    filename: str | None = None
    isDeleted: bool | None = None
    lastAction: str | None = None


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


class ProbeTogglePayload(BaseModel):
    enabled: bool


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


async def ensure_db_indexes(db: AsyncIOMotorDatabase) -> None:
    await db.lectures.create_index("created_at")
    await db.lectures.create_index("title")
    await db.lectures.create_index("description")


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
        filename=doc.get("filename"),
        isDeleted=doc.get("isDeleted", False),
        lastAction=doc.get("lastAction", "linked"),
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


def extract_duration_seconds(media_source: str) -> float:
    output = _run_subprocess(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            media_source,
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
    normalized = re.sub(r"\s+", " ", text or "").strip()
    if not normalized:
        return []

    segments = [segment.strip(" -") for segment in re.split(r"[.!?]+", normalized) if segment.strip()]
    cleaned: list[str] = []
    seen: set[str] = set()

    for segment in segments:
        if len(segment) < 12:
            continue
        segment = segment[0].upper() + segment[1:] if segment else segment
        if not segment.endswith((".", "!", "?")):
            segment = f"{segment}."
        dedupe_key = re.sub(r"\W+", "", segment.lower())
        if dedupe_key and dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        cleaned.append(segment)

    return cleaned[:8]


def build_transcript(title: str, description: str, duration_seconds: float) -> list[dict[str, str]]:
    chunks = _sentence_chunks(description)
    title_words = [word for word in re.split(r"\W+", title) if len(word) > 2]
    keyword_candidates = [word for word in re.split(r"\W+", description) if len(word) >= 5]
    keywords = list(dict.fromkeys(word.lower() for word in keyword_candidates))[:8]

    if duration_seconds <= 300:
        section_count = 4
    elif duration_seconds <= 1200:
        section_count = 5
    else:
        section_count = 6

    phase_labels = [
        "Introduction",
        "Core concept",
        "Worked example",
        "Practical guidance",
        "Common pitfalls",
        "Recap",
    ]

    if not chunks:
        title_phrase = " ".join(title_words[:3]) if title_words else title
        chunks = [
            f"This lecture introduces {title_phrase} and explains why it matters in real systems.",
            "We break down the main ideas step by step with concrete examples.",
            "You will see practical implementation choices and trade-offs.",
            "We close with actionable takeaways you can apply immediately.",
        ]

    safe_duration = max(180, int(duration_seconds) if duration_seconds > 0 else 180)
    interval = max(20, safe_duration // section_count)

    transcript: list[dict[str, str]] = []
    for index in range(section_count):
        timestamp = format_duration(index * interval)
        if index < len(chunks):
            source_text = chunks[index]
        else:
            focus = keywords[(index - len(chunks)) % len(keywords)] if keywords else "key techniques"
            source_text = f"We focus on {focus} and connect it to practical decision-making in this topic."

        label = phase_labels[index] if index < len(phase_labels) else f"Section {index + 1}"
        source_text = f"{label}: {source_text}"
        transcript.append({"timestamp": timestamp, "text": source_text})

    return transcript


def _parse_transcript_line(line: str) -> tuple[str, str] | None:
    text = line.strip()
    if not text:
        return None

    patterns = [
        r"^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.+)$",
        r"^(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–:]\s*(.+)$",
        r"^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$",
    ]

    for pattern in patterns:
        match = re.match(pattern, text)
        if not match:
            continue
        timestamp_raw = match.group(1).strip()
        body = match.group(2).strip()
        if not body:
            return None
        seconds = int(parse_duration_to_seconds(timestamp_raw))
        timestamp = format_duration(seconds)
        if not body.endswith((".", "!", "?")):
            body = f"{body}."
        return timestamp, body

    return None


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


async def generate_ai_summary(
    title: str,
    description: str,
    transcript: list[dict[str, str]],
    video_url: str | None = None,
) -> str:
    sample_profile = get_known_sample_video_metadata(video_url)
    if sample_profile:
        return str(sample_profile["aiSummary"])

    if not ENABLE_AI_SUMMARY:
        return f"{title} summary generation is disabled for this environment."

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


async def generate_ai_transcript(
    title: str,
    description: str,
    duration_seconds: float,
    video_url: str | None = None,
) -> list[dict[str, str]]:
    sample_profile = get_known_sample_video_metadata(video_url)
    if sample_profile:
        return list(sample_profile["transcript"])

    if not GOOGLE_API_KEY:
        return build_transcript(title, description, duration_seconds)

    try:
        prompt = f"""Create an educational transcript for a {max(3, int(duration_seconds / 60))}-minute lecture.

Title: {title}
Description: {description}

    Generate 5-7 timestamped segments at regular intervals. Each segment should:
- Start with timestamp in MM:SS format
    - Contain exactly 1 concise sentence of educational content
- Progress logically through the topic

    Output ONLY lines in this format: [MM:SS] Content here

Transcript:"""

        loop = asyncio.get_event_loop()
        def call_genai():
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content(prompt)
            return response.text.strip()
        
        transcript_text = await asyncio.wait_for(loop.run_in_executor(EXECUTOR, call_genai), timeout=30)
        transcript: list[dict[str, str]] = []
        used_timestamps: set[str] = set()

        for line in transcript_text.split("\n"):
            parsed = _parse_transcript_line(line)
            if not parsed:
                continue
            timestamp, segment_text = parsed
            if timestamp in used_timestamps:
                continue
            used_timestamps.add(timestamp)
            transcript.append({"timestamp": timestamp, "text": segment_text})

        transcript.sort(key=lambda item: parse_duration_to_seconds(item["timestamp"]))

        if len(transcript) < 3:
            return build_transcript(title, description, duration_seconds)
        return transcript
    except Exception as e:
        logger.warning("AI transcript generation failed for %s: %s", title, e)
        return build_transcript(title, description, duration_seconds)


async def generate_ai_segment_summary(title: str, description: str, snippet: str) -> str:
    """Use AI to summarize a small excerpt of the lecture text."""
    if not ENABLE_LIVE_SUMMARY:
        return "(live summary disabled in this environment)"

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


async def generate_ai_key_concepts(
    title: str,
    transcript: list[dict[str, str]],
    video_url: str | None = None,
) -> list[dict[str, str]]:
    sample_profile = get_known_sample_video_metadata(video_url)
    if sample_profile:
        return list(sample_profile["keyConcepts"])

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

        video_url = str(lecture.get("videoUrl", "") or "")
        sample_profile = get_known_sample_video_metadata(video_url)
        title = str(sample_profile.get("title") if sample_profile else lecture.get("title", "Lecture"))
        description = str(sample_profile.get("description") if sample_profile else lecture.get("description", "Uploaded lecture"))
        existing_duration = str(lecture.get("duration", "00:00"))
        duration_seconds = parse_duration_to_seconds(
            str(sample_profile.get("duration")) if sample_profile else existing_duration
        )

        source_job_id = lecture.get("source_job_id")
        thumbnail_rel = str(sample_profile.get("image") if sample_profile else lecture.get("image", "") or "")
        file_path: Path | None = None

        if source_job_id:
            job_doc = await db.jobs.find_one({"job_id": source_job_id})
            file_path = Path(job_doc.get("file_path", "")) if job_doc else None
            if file_path and file_path.exists():
                probed_seconds = extract_duration_seconds(str(file_path))
                if probed_seconds > 0:
                    duration_seconds = probed_seconds
                thumbnail_path = UPLOAD_DIR / "thumbnails" / f"{source_job_id}.jpg"
                if generate_thumbnail(file_path, thumbnail_path):
                    thumbnail_rel = f"/api/video/{source_job_id}/thumbnail"

        if not sample_profile and video_url.startswith(("http://", "https://")):
            remote_probed_seconds = extract_duration_seconds(video_url)
            if remote_probed_seconds > 0:
                duration_seconds = remote_probed_seconds

        if duration_seconds <= 0:
            duration_seconds = estimate_duration_seconds_from_text(
                lecture.get("transcript") if isinstance(lecture.get("transcript"), list) else None,
                description,
                title,
            )

        transcript = lecture.get("transcript")
        if sample_profile:
            transcript = list(sample_profile["transcript"])
        elif not isinstance(transcript, list) or len(transcript) == 0:
            transcript = await generate_ai_transcript(title, description, duration_seconds, video_url)

        key_concepts = lecture.get("keyConcepts")
        if sample_profile:
            key_concepts = list(sample_profile["keyConcepts"])
        elif not isinstance(key_concepts, list) or len(key_concepts) == 0:
            key_concepts = await generate_ai_key_concepts(title, transcript, video_url)

        # always regenerate summary to ensure accurate content
        logger.info(f"Generating AI summary for {slug}")
        ai_summary = await generate_ai_summary(title, description, transcript, video_url)

        update_payload = {
            "title": title,
            "description": description,
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
            "title": "Big Buck Bunny",
            "description": "A laid-back rabbit enjoys a peaceful morning in the forest until three mischievous rodents start harassing the smaller animals around him.",
            "duration": "09:56",
            "image": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg",
            "publishedDate": "February 24, 2026",
            "views": "128 views",
            "aiSummary": "Big Buck Bunny is a short animated comedy that contrasts a calm forest morning with a string of escalating slapstick pranks. The story follows the rabbit from patient observer to clever avenger as he turns the bullies' chaos back on them.",
            "keyConcepts": [
                {"title": "Peaceful Opening", "timestamp": "00:00"},
                {"title": "Bullies Arrive", "timestamp": "01:45"},
                {"title": "Payback Setup", "timestamp": "05:40"},
                {"title": "Final Gag", "timestamp": "08:48"},
            ],
            "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
            "transcript": [
                {"timestamp": "00:00", "text": "Opening scene: Big Buck Bunny enjoys butterflies, birds, and the calm rhythm of the forest."},
                {"timestamp": "01:45", "text": "Inciting moment: Three tiny rodents appear and start tormenting other animals for fun."},
                {"timestamp": "03:25", "text": "Escalation: The pranksters begin targeting the bunny as well, turning the peaceful setting into slapstick chaos."},
                {"timestamp": "05:40", "text": "Preparation: After taking the abuse in silence, the bunny methodically turns the forest into a trap-filled revenge plan."},
                {"timestamp": "07:20", "text": "Reversal: Each trap lands in sequence and the bullies get hit by the same kind of mayhem they created."},
                {"timestamp": "08:48", "text": "Closing beat: The short ends with one final visual joke that completes the bunny's comic payback."},
            ],
            "created_at": now,
            "updated_at": now,
            "viewedBy": [],
        },
        {
            "slug": "cloud-native-architecture",
            "title": "Elephants Dream",
            "description": "Two travelers move through a surreal machine world while an older guide pushes a younger companion to accept his increasingly distorted view of reality.",
            "duration": "10:53",
            "image": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg",
            "publishedDate": "February 24, 2026",
            "views": "92 views",
            "aiSummary": "Elephants Dream is a surreal animated short about perspective, control, and the instability of memory inside a giant mechanical labyrinth. The film contrasts Proog's obsession with Emo's uncertainty until the imagined order of the world finally breaks apart.",
            "keyConcepts": [
                {"title": "Machine World", "timestamp": "00:00"},
                {"title": "Proog's Control", "timestamp": "02:10"},
                {"title": "Emo's Doubt", "timestamp": "05:35"},
                {"title": "Reality Fractures", "timestamp": "08:50"},
            ],
            "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
            "transcript": [
                {"timestamp": "00:00", "text": "Opening scene: Proog leads Emo through an enormous and dreamlike mechanical environment full of moving structures."},
                {"timestamp": "02:10", "text": "Character dynamic: Proog speaks with certainty about the world around them and treats the machinery as something he understands and controls."},
                {"timestamp": "05:35", "text": "Tension grows: Emo reacts with hesitation and confusion, suggesting that Proog's explanations do not fully match what is happening."},
                {"timestamp": "07:25", "text": "Psychological shift: The journey becomes less about navigation and more about whether the machine world reflects obsession, memory, or delusion."},
                {"timestamp": "08:50", "text": "Climax: The fragile logic holding Proog's reality together starts to collapse, exposing the instability of his worldview."},
                {"timestamp": "10:10", "text": "Closing beat: The short ends on ambiguity, leaving the viewer with questions about control, trust, and perception."},
            ],
            "created_at": now,
            "updated_at": now,
            "viewedBy": [],
        },
        {
            "slug": "ai-powered-learning",
            "title": "Sintel",
            "description": "A young woman travels through harsh terrain while searching for a dragon she once rescued, driven by loyalty, grief, and incomplete memories.",
            "duration": "14:48",
            "image": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg",
            "publishedDate": "February 24, 2026",
            "views": "64 views",
            "aiSummary": "Sintel is an animated fantasy short that follows a lone traveler on a difficult search for the dragon she calls Scales. What begins as a rescue story turns tragic as the journey reveals how memory and loss have reshaped her understanding of the past.",
            "keyConcepts": [
                {"title": "Wilderness Journey", "timestamp": "00:00"},
                {"title": "Scales Backstory", "timestamp": "03:40"},
                {"title": "Mountain Search", "timestamp": "08:20"},
                {"title": "Tragic Reveal", "timestamp": "13:10"},
            ],
            "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
            "transcript": [
                {"timestamp": "00:00", "text": "Opening scene: Sintel pushes through snow and ruins, clearly exhausted but still focused on reaching her destination."},
                {"timestamp": "03:40", "text": "Backstory: Flashbacks show how she found an injured baby dragon, cared for it, and formed a close bond with it."},
                {"timestamp": "06:10", "text": "Loss and pursuit: After the dragon is taken, Sintel commits herself to a long and dangerous search to bring it back."},
                {"timestamp": "08:20", "text": "Escalation: The journey intensifies as she climbs into hostile terrain and faces larger threats connected to the dragon's world."},
                {"timestamp": "11:30", "text": "Confrontation: Sintel reaches the dragon she has been hunting, but the encounter does not unfold the way she expects."},
                {"timestamp": "13:10", "text": "Revelation: The ending reframes the entire quest through grief and memory, giving the story its tragic emotional payoff."},
            ],
            "created_at": now,
            "updated_at": now,
            "viewedBy": [],
        },
        {
            "slug": "security-for-streaming",
            "title": "Tears of Steel",
            "description": "A small team in a futuristic Amsterdam uses improvised science and emotional history to confront giant robots threatening the city.",
            "duration": "12:14",
            "image": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg",
            "publishedDate": "February 24, 2026",
            "views": "41 views",
            "aiSummary": "Tears of Steel blends romance, science fiction, and action as a team tries to stop a robotic attack in near-future Amsterdam. The film ties its spectacle to a personal conflict, using a risky time-based intervention to resolve both the invasion and an unfinished relationship.",
            "keyConcepts": [
                {"title": "Robot Threat", "timestamp": "00:00"},
                {"title": "Team Regroups", "timestamp": "03:00"},
                {"title": "Time Hack Plan", "timestamp": "07:10"},
                {"title": "Final Confrontation", "timestamp": "10:35"},
            ],
            "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
            "transcript": [
                {"timestamp": "00:00", "text": "Opening scene: Amsterdam is under attack by giant robots, establishing the film's high-stakes science-fiction setting."},
                {"timestamp": "03:00", "text": "Team setup: A small group of specialists regathers and reconnects around a plan to neutralize the machines."},
                {"timestamp": "05:10", "text": "Personal conflict: The mission is complicated by unresolved tension between key characters whose history still shapes their choices."},
                {"timestamp": "07:10", "text": "Strategy shift: The group decides to use a precise time-based intervention instead of brute force to stop the attack."},
                {"timestamp": "09:05", "text": "Execution: The plan moves into action as technology, timing, and emotional stakes converge in the same moment."},
                {"timestamp": "10:35", "text": "Resolution: The final confrontation connects the robot threat to the characters' relationship, closing the story on both action and emotion."},
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
    liveness_ok = bool(getattr(app.state, "liveness_ok", True))
    readiness_ok = bool(getattr(app.state, "readiness_ok", True))
    return {
        "status": "healthy" if (liveness_ok and readiness_ok) else "degraded",
        "service": "video-api",
        "liveness": "ok" if liveness_ok else "failing",
        "readiness": "ready" if readiness_ok else "not-ready",
    }


@app.get("/health/liveness")
async def liveness_probe() -> dict[str, str]:
    if not bool(getattr(app.state, "liveness_ok", True)):
        raise HTTPException(status_code=500, detail="Liveness probe forced to fail")
    return {"status": "alive", "service": "video-api"}


@app.get("/health/readiness")
async def readiness_probe(db: AsyncIOMotorDatabase = Depends(get_db)) -> dict[str, str]:
    if not bool(getattr(app.state, "readiness_ok", True)):
        raise HTTPException(status_code=503, detail="Readiness probe forced to fail")

    await db.command({"ping": 1})
    return {"status": "ready", "service": "video-api"}


@app.get("/observability/metrics-snapshot")
async def observability_metrics_snapshot() -> dict[str, Any]:
    store = getattr(app.state, "observability", _build_observability_store())
    recent_latencies = list(store.get("latency_ms_recent", []))
    requests_total = int(store.get("requests_total", 0))
    errors_total = int(store.get("errors_total", 0))

    error_rate_percent = round((errors_total / requests_total) * 100, 2) if requests_total > 0 else 0.0
    average_latency_ms = round(sum(recent_latencies) / len(recent_latencies), 2) if recent_latencies else 0.0

    top_paths = sorted(
        store.get("path_counts", {}).items(),
        key=lambda item: item[1],
        reverse=True,
    )[:10]

    return {
        "service": "video-api",
        "startedAt": store.get("started_at"),
        "requestsTotal": requests_total,
        "errorsTotal": errors_total,
        "errorRatePercent": error_rate_percent,
        "latencyMs": {
            "average": average_latency_ms,
            "p95": _percentile(recent_latencies, 95),
            "sampleSize": len(recent_latencies),
        },
        "statusCounts": dict(store.get("status_counts", {})),
        "topPaths": [{"path": path, "count": count} for path, count in top_paths],
        "notes": [
            "This endpoint provides lightweight in-app observability for Sprint #3 learning.",
            "Use a dedicated metrics backend for production-scale retention and alerting.",
        ],
    }


@app.get("/metrics")
async def prometheus_metrics() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/api/admin/probes")
async def get_probe_states() -> dict[str, bool]:
    return {
        "liveness": bool(getattr(app.state, "liveness_ok", True)),
        "readiness": bool(getattr(app.state, "readiness_ok", True)),
    }


@app.post("/api/admin/probes/liveness")
async def set_liveness_probe(payload: ProbeTogglePayload) -> dict[str, Any]:
    app.state.liveness_ok = payload.enabled
    return {
        "probe": "liveness",
        "enabled": bool(app.state.liveness_ok),
        "message": "Liveness probe state updated",
    }


@app.post("/api/admin/probes/readiness")
async def set_readiness_probe(payload: ProbeTogglePayload) -> dict[str, Any]:
    app.state.readiness_ok = payload.enabled
    return {
        "probe": "readiness",
        "enabled": bool(app.state.readiness_ok),
        "message": "Readiness probe state updated",
    }


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
        "filename": f"{job_id}_{sanitized_name}",
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
    q: str | None = Query(default=None, max_length=120),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[Lecture]:
    filters: dict[str, Any] = {}
    search_query = (q or "").strip()
    if search_query:
        escaped = re.escape(search_query)
        filters = {
            "$or": [
                {"title": {"$regex": escaped, "$options": "i"}},
                {"description": {"$regex": escaped, "$options": "i"}},
            ]
        }

    cursor = db.lectures.find(filters).sort("created_at", -1)
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
    if not doc.get("filename"):
        doc["filename"] = ""
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
    if "filename" not in updates:
        updates["filename"] = existing.get("filename", "")
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

    video_url = str(doc.get("videoUrl", "") or "")
    sample_profile = get_known_sample_video_metadata(video_url)
    title = str(sample_profile.get("title") if sample_profile else doc.get("title", "Lecture"))
    description = str(sample_profile.get("description") if sample_profile else doc.get("description", ""))
    duration_seconds = parse_duration_to_seconds(
        str(sample_profile.get("duration")) if sample_profile else str(doc.get("duration", "0:00"))
    )
    transcript = await generate_ai_transcript(title, description, duration_seconds, video_url)
    key_concepts = await generate_ai_key_concepts(title, transcript, video_url)
    ai_summary = await generate_ai_summary(title, description, transcript, video_url)
    await db.lectures.update_one(
        {"slug": slug},
        {
            "$set": {
                "title": title,
                "description": description,
                "duration": format_duration(duration_seconds) if duration_seconds > 0 else str(doc.get("duration", "0:00")),
                "image": str(sample_profile.get("image")) if sample_profile else str(doc.get("image", "") or ""),
                "transcript": transcript,
                "keyConcepts": key_concepts,
                "aiSummary": ai_summary,
                "updated_at": utcnow(),
            }
        },
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

        duration_seconds = extract_duration_seconds(str(file_path)) if file_path and file_path.exists() else 0.0
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
