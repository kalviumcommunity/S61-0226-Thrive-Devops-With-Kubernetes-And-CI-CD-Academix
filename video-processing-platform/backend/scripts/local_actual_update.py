import json
import urllib.request
from pathlib import Path

from faster_whisper import WhisperModel

VIDEO_PATH = Path("video-processing-platform/backend/uploads/1764a945_Best_Advice_to_Small_Business_Owners_480P.mp4")
SLUG = "advice-to-small-business-owners-1764a945"
BASE_URL = "http://127.0.0.1:8000"


def transcribe_video(path: Path) -> list[dict[str, str]]:
    model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
    segments, _info = model.transcribe(str(path), beam_size=1, vad_filter=True)
    raw: list[dict[str, str]] = []
    for seg in segments:
        text = (seg.text or "").strip()
        if not text:
            continue
        mm = int(seg.start // 60)
        ss = int(seg.start % 60)
        raw.append({"timestamp": f"{mm:02d}:{ss:02d}", "text": text})

    if not raw:
        raise RuntimeError("No transcript extracted from video")

    max_items = 8
    if len(raw) <= max_items:
        return raw

    step = max(1, len(raw) // max_items)
    return [raw[i] for i in range(0, len(raw), step)][:max_items]


def put_lecture(payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/api/lectures/{SLUG}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode("utf-8"))


if __name__ == "__main__":
    transcript = transcribe_video(VIDEO_PATH)

    payload = {
        "description": "A concise leadership message for small business owners on customer delight, disciplined execution, and building a strong business from the earliest stage.",
        "aiSummary": "This video shares practical small-business advice: obsess over customer delight, put in consistent hard work, and stay close to customer feedback from day one. It highlights that early-stage focus and daily execution habits are the foundation for long-term growth.",
        "transcript": transcript,
        "keyConcepts": [
            {"title": "Delight the Customer", "timestamp": transcript[0]["timestamp"]},
            {"title": "Customer Feedback Loop", "timestamp": transcript[min(2, len(transcript) - 1)]["timestamp"]},
            {"title": "No Substitute for Hard Work", "timestamp": transcript[min(4, len(transcript) - 1)]["timestamp"]},
            {"title": "Early-Stage Founder Mindset", "timestamp": transcript[-1]["timestamp"]},
        ],
    }

    updated = put_lecture(payload)
    print("updated_slug:", updated.get("slug"))
    print("updated_summary:", updated.get("aiSummary"))
    first = (updated.get("transcript") or [{}])[0]
    print("first_transcript:", first.get("text", ""))
    print("segments:", len(updated.get("transcript") or []))
