"""Batch Whisper update script.

Finds all lectures with template/placeholder content, transcribes their video
files with faster-whisper, derives key concepts from real speech, and updates
the DB via the backend REST API.

Usage (from workspace root):
  python video-processing-platform/backend/scripts/batch_whisper_update.py
  python video-processing-platform/backend/scripts/batch_whisper_update.py --slug binary-search-45567774
  python video-processing-platform/backend/scripts/batch_whisper_update.py --all
"""

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

UPLOADS_DIR = Path("video-processing-platform/backend/uploads")
BASE_URL = "http://127.0.0.1:8000"
MAX_SEGMENTS = 8
WHISPER_MODEL = "tiny.en"

# ── Template-content detection ─────────────────────────────────────────────────

TEMPLATE_SUMMARY_PHRASES = [
    "covers practical concepts with a timestamped transcript",
    "ai summary will be available after post-processing",
    "We focus on",
]

TEMPLATE_CONCEPT_TITLES = {"Binary", "Search", "Introduction", "Core", "Practical"}


def _is_template_content(lecture: dict) -> bool:
    summary = (lecture.get("aiSummary") or "").lower()
    for phrase in TEMPLATE_SUMMARY_PHRASES:
        if phrase.lower() in summary:
            return True
    concepts = lecture.get("keyConcepts") or []
    concept_titles = {c.get("title", "") for c in concepts}
    if concept_titles and concept_titles.issubset(TEMPLATE_CONCEPT_TITLES):
        return True
    return False


# ── Video file discovery ────────────────────────────────────────────────────────

def find_video_file(slug: str) -> Path | None:
    """Extract job_id from slug suffix and glob for matching upload file."""
    # Slug format: some-title-<job_id>  (job_id is a short hex, e.g. 45567774)
    parts = slug.rsplit("-", 1)
    if len(parts) != 2:
        return None
    job_id = parts[1]
    candidates = sorted(p for p in UPLOADS_DIR.glob(f"{job_id}_*") if p.is_file())
    return candidates[0] if candidates else None


# ── Whisper transcription ───────────────────────────────────────────────────────

def transcribe_video(video_path: Path) -> list[dict[str, str]]:
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("ERROR: faster_whisper not installed. Run: pip install faster-whisper")
        sys.exit(1)

    print(f"  Transcribing {video_path.name} with Whisper {WHISPER_MODEL}...")
    model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(str(video_path), beam_size=1, vad_filter=True)

    raw: list[dict[str, str]] = []
    for seg in segments:
        text = (seg.text or "").strip()
        if not text:
            continue
        mm = int(seg.start // 60)
        ss = int(seg.start % 60)
        raw.append({"timestamp": f"{mm:02d}:{ss:02d}", "text": text})

    if not raw:
        return []

    if len(raw) <= MAX_SEGMENTS:
        return raw

    step = max(1, len(raw) // MAX_SEGMENTS)
    return [raw[i] for i in range(0, len(raw), step)][:MAX_SEGMENTS]


# ── Key concept extraction from transcript ─────────────────────────────────────

STOP_WORDS = {
    "this", "that", "with", "from", "they", "have", "your", "about", "there",
    "their", "what", "when", "where", "which", "will", "would", "could",
    "should", "them", "into", "just", "been", "being", "than", "then", "also",
    "very", "more", "some", "such", "through", "over", "under", "while",
    "because", "focus", "example", "concept", "okay", "going", "actually",
    "really", "right", "like", "know", "think", "make", "want", "need",
    "here", "look", "take", "come", "good", "well", "time", "implementation",
    "recursive", "anymore", "interview", "coding", "first",
}


def extract_key_concepts(transcript: list[dict[str, str]], title: str) -> list[dict[str, str]]:
    phrase_concepts: list[dict[str, str]] = []
    seen_titles: set[str] = set()
    first_timestamp = transcript[0]["timestamp"] if transcript else "00:00"
    normalized_title = re.sub(r"\s+", " ", title).strip()

    if normalized_title:
        phrase_concepts.append({"title": normalized_title, "timestamp": first_timestamp})
        seen_titles.add(normalized_title.lower())

    priority_patterns = [
        (r"\bbinary\s+search\b", "Binary Search"),
        (r"\bsorted\s+array\b", "Sorted Array"),
        (r"\bsearch\s+space\b", "Search Space Reduction"),
        (r"\bsingle\s+comparison\b", "Single Comparison"),
        (r"\brecursive\s+implementation\b", "Recursive Implementation"),
        (r"\biterative\b", "Iterative Approach"),
        (r"\bbase\s+case\b", "Base Case"),
    ]

    for pattern, concept_title in priority_patterns:
        for segment in transcript:
            text = (segment.get("text") or "").lower()
            if not re.search(pattern, text):
                continue
            concept_key = concept_title.lower()
            if concept_key in seen_titles:
                break
            seen_titles.add(concept_key)
            phrase_concepts.append({"title": concept_title, "timestamp": segment.get("timestamp", "00:00")})
            break

    if len(phrase_concepts) >= 3:
        return phrase_concepts[:4]

    term_counts: dict[str, int] = {}
    first_timestamp: dict[str, str] = {}

    for segment in transcript:
        timestamp = segment.get("timestamp", "00:00")
        text = (segment.get("text") or "").lower()
        for term in re.findall(r"[a-z][a-z\-]{3,}", text):
            if term in STOP_WORDS:
                continue
            term_counts[term] = term_counts.get(term, 0) + 1
            first_timestamp.setdefault(term, timestamp)

    if not term_counts:
        return phrase_concepts[:4] if phrase_concepts else [{"title": "Key Topic", "timestamp": "00:00"}]

    ranked = sorted(term_counts.items(), key=lambda item: (-item[1], item[0]))[:4]
    frequency_concepts = [
        {"title": term.replace("-", " ").title(), "timestamp": first_timestamp[term]}
        for term, _ in ranked
    ]
    merged = phrase_concepts + frequency_concepts
    deduped: list[dict[str, str]] = []
    seen: set[str] = set()
    for concept in merged:
        key = str(concept.get("title", "")).lower()
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(concept)
    return deduped[:4] if deduped else [{"title": "Key Topic", "timestamp": "00:00"}]


def build_summary(transcript: list[dict[str, str]], title: str) -> str:
    texts = [s.get("text", "").strip() for s in transcript if s.get("text", "").strip()]
    if not texts:
        return f"{title} — lecture content."
    lead = texts[0]
    middle = texts[len(texts) // 2] if len(texts) > 1 else ""
    tail = texts[-1] if len(texts) > 1 else ""
    parts = [p for p in [lead, middle, tail] if p and p != lead or p == lead]
    seen: list[str] = []
    for p in [lead, middle, tail]:
        if p and p not in seen:
            seen.append(p)
    return " ".join(seen).strip()


def build_description(transcript: list[dict[str, str]], title: str) -> str:
    texts = [s.get("text", "").strip() for s in transcript if s.get("text", "").strip()]
    if not texts:
        return f"{title} lecture"
    combined = " ".join(texts[:2]).strip()
    if len(combined) > 220:
        combined = f"{combined[:217].rstrip()}..."
    return combined


# ── API helpers ─────────────────────────────────────────────────────────────────

def get_lectures() -> list[dict]:
    with urllib.request.urlopen(f"{BASE_URL}/api/lectures", timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def put_lecture(slug: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/api/lectures/{slug}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ── Main update logic ───────────────────────────────────────────────────────────

def update_lecture(lecture: dict) -> bool:
    slug = lecture.get("slug", "")
    title = lecture.get("title", "Lecture")
    print(f"\n[{slug}]")

    video_path = find_video_file(slug)
    if not video_path:
        print(f"  SKIP — no video file found in uploads/ for job suffix")
        return False

    transcript = transcribe_video(video_path)
    if not transcript:
        print(f"  SKIP — Whisper produced empty transcript")
        return False

    print(f"  Got {len(transcript)} segments")
    print(f"  First: {transcript[0]['timestamp']} — {transcript[0]['text'][:60]}")

    key_concepts = extract_key_concepts(transcript, title)
    summary = build_summary(transcript, title)
    description = build_description(transcript, title)

    payload = {
        "description": description,
        "transcript": transcript,
        "keyConcepts": key_concepts,
        "aiSummary": summary,
    }

    try:
        updated = put_lecture(slug, payload)
        out_segs = len(updated.get("transcript") or [])
        print(f"  Updated: {out_segs} transcript segments, {len(updated.get('keyConcepts') or [])} key concepts")
        return True
    except urllib.error.URLError as err:
        print(f"  ERROR updating {slug}: {err}")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Batch Whisper update for lectures")
    parser.add_argument("--slug", help="Update a specific lecture slug only")
    parser.add_argument("--all", action="store_true", help="Update ALL lectures (including those with real content)")
    args = parser.parse_args()

    lectures = get_lectures()
    print(f"Found {len(lectures)} lectures in total")

    if args.slug:
        targets = [lec for lec in lectures if lec.get("slug") == args.slug]
        if not targets:
            print(f"ERROR: Lecture '{args.slug}' not found")
            sys.exit(1)
    elif args.all:
        targets = lectures
    else:
        # Default: only lectures with template/placeholder content
        targets = [lec for lec in lectures if _is_template_content(lec)]
        print(f"{len(targets)} lectures have template content and need updating")

    if not targets:
        print("Nothing to update.")
        return

    updated_count = 0
    for lec in targets:
        if update_lecture(lec):
            updated_count += 1

    print(f"\nDone: {updated_count}/{len(targets)} lectures updated successfully")


if __name__ == "__main__":
    main()
