"""Generate thumbnails for uploaded lectures using PyAV."""
import sys
from pathlib import Path

UPLOADS = Path(__file__).parent.parent / "uploads"
THUMBS = UPLOADS / "thumbnails"
THUMBS.mkdir(exist_ok=True)


def extract(video_path: Path, out_path: Path) -> bool:
    import av  # type: ignore[import-untyped]
    container = av.open(str(video_path))
    stream = container.streams.video[0]
    try:
        target_pts = int(2 / stream.time_base)
        container.seek(target_pts, stream=stream)
    except Exception:
        container.seek(0, stream=stream)
    stream.codec_context.skip_frame = "NONKEY"
    frame = None
    for frame in container.decode(stream):
        break
    container.close()
    if frame is None:
        return False
    oc = av.open(str(out_path), mode="w")
    vs = oc.add_stream("mjpeg")
    vs.width = frame.width
    vs.height = frame.height
    vs.pix_fmt = "yuvj420p"
    oc.mux(vs.encode(frame.reformat(format="yuvj420p")))
    oc.close()
    return out_path.exists() and out_path.stat().st_size > 0


def main():
    videos = [p for p in UPLOADS.iterdir() if p.is_file() and p.suffix in {".mp4", ".mov", ".webm", ".mkv"}]
    for video in sorted(videos):
        job_id = video.name.split("_")[0]
        out = THUMBS / f"{job_id}.jpg"
        if out.exists():
            print(f"SKIP {job_id} (already exists)")
            continue
        print(f"Generating thumbnail for {job_id} ({video.name}) ...", end=" ")
        try:
            ok = extract(video, out)
            print("OK" if ok else "FAILED")
        except Exception as e:
            print(f"ERROR: {e}")


if __name__ == "__main__":
    main()
