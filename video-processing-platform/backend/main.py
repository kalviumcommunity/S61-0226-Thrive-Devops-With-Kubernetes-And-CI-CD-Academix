import uuid
import asyncio
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("video-api")

app = FastAPI(title="Video Processing API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job store
jobs: Dict[str, dict] = {}

class JobStatus(BaseModel):
    id: str
    filename: str
    status: str
    progress: float
    formats: list[str]

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "video-api"}

@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video")

    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {
        "id": job_id,
        "filename": file.filename,
        "status": "queued",
        "progress": 0.0,
        "formats": ["720p", "480p", "360p"],
    }
    logger.info(f"Job {job_id} created for {file.filename}")

    # Save file
    contents = await file.read()
    with open(f"/tmp/{job_id}_{file.filename}", "wb") as f:
        f.write(contents)

    # Start background transcoding
    asyncio.create_task(transcode(job_id, file.filename))
    return {"job_id": job_id, "message": "Upload accepted, transcoding started"}

@app.get("/api/status/{job_id}", response_model=JobStatus)
def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]

async def transcode(job_id: str, filename: str):
    """Simulate FFmpeg transcoding with progress updates."""
    jobs[job_id]["status"] = "processing"
    logger.info(f"Job {job_id}: transcoding started")

    for i in range(1, 11):
        await asyncio.sleep(2)  # Simulate work
        jobs[job_id]["progress"] = i * 10
        logger.info(f"Job {job_id}: {i * 10}% complete")

    jobs[job_id]["status"] = "completed"
    jobs[job_id]["progress"] = 100
    logger.info(f"Job {job_id}: transcoding completed")
