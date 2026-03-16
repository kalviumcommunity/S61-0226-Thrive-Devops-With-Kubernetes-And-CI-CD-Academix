import argparse
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from pymongo import MongoClient
import boto3
from botocore.exceptions import ClientError


def build_video_key(job_id: str, filename: str) -> str:
    safe_name = Path(filename or f"{job_id}.mp4").name
    return f"videos/{job_id}_{safe_name}"


def build_thumbnail_key(job_id: str) -> str:
    return f"thumbnails/{job_id}.jpg"


def object_exists(s3_client: Any, bucket: str, key: str) -> bool:
    try:
        s3_client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as error:
        code = str(error.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise


def upload_file(s3_client: Any, bucket: str, local_path: Path, key: str, content_type: str | None = None) -> None:
    extra_args: dict[str, str] = {}
    if content_type:
        extra_args["ContentType"] = content_type
    if extra_args:
        s3_client.upload_file(str(local_path), bucket, key, ExtraArgs=extra_args)
    else:
        s3_client.upload_file(str(local_path), bucket, key)


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate local media files in jobs collection to S3.")
    parser.add_argument("--limit", type=int, default=100, help="Max number of jobs to scan")
    parser.add_argument("--include-thumbnails", action="store_true", help="Also migrate thumbnails/<job_id>.jpg")
    parser.add_argument("--dry-run", action="store_true", help="Only print actions, do not upload/update")
    args = parser.parse_args()

    load_dotenv()

    mongo_url = os.getenv("MONGO_URL", "")
    mongo_db = os.getenv("MONGO_DB_NAME", "video_platform")
    bucket = os.getenv("MEDIA_S3_BUCKET", "")
    region = os.getenv("MEDIA_S3_REGION", "")
    access_key = os.getenv("MEDIA_S3_ACCESS_KEY_ID", "")
    secret_key = os.getenv("MEDIA_S3_SECRET_ACCESS_KEY", "")

    if not mongo_url:
        raise RuntimeError("MONGO_URL is missing")
    if not bucket:
        raise RuntimeError("MEDIA_S3_BUCKET is missing")

    s3 = boto3.client(
        "s3",
        region_name=region or None,
        aws_access_key_id=access_key or None,
        aws_secret_access_key=secret_key or None,
    )

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
    db = client[mongo_db]

    jobs = list(
        db.jobs.find(
            {},
            {
                "_id": 0,
                "job_id": 1,
                "filename": 1,
                "content_type": 1,
                "file_path": 1,
                "media_object_key": 1,
                "thumbnail_object_key": 1,
            },
        )
        .sort("created_at", -1)
        .limit(max(1, args.limit))
    )

    scanned = 0
    uploaded_videos = 0
    uploaded_thumbs = 0
    skipped_missing = 0

    for job in jobs:
        scanned += 1
        job_id = str(job.get("job_id", "") or "")
        if not job_id:
            continue

        file_path = Path(str(job.get("file_path", "") or ""))
        filename = str(job.get("filename", "") or f"{job_id}.mp4")
        content_type = str(job.get("content_type", "") or "video/mp4")

        if not file_path.exists():
            print(f"SKIP missing local video file: job_id={job_id} path={file_path}")
            skipped_missing += 1
            continue

        video_key = str(job.get("media_object_key", "") or "") or build_video_key(job_id, filename)
        video_exists = object_exists(s3, bucket, video_key)

        if args.dry_run:
            print(f"DRY-RUN video: job_id={job_id} key={video_key} exists={video_exists}")
        else:
            if not video_exists:
                upload_file(s3, bucket, file_path, video_key, content_type)
                print(f"UPLOADED video: job_id={job_id} key={video_key}")
                uploaded_videos += 1

            db.jobs.update_one(
                {"job_id": job_id},
                {"$set": {"media_object_key": video_key}},
            )
            db.lectures.update_one(
                {"source_job_id": job_id},
                {"$set": {"videoBlobKey": video_key}},
            )

        if args.include_thumbnails:
            thumb_path = file_path.parent / "thumbnails" / f"{job_id}.jpg"
            if thumb_path.exists():
                thumb_key = str(job.get("thumbnail_object_key", "") or "") or build_thumbnail_key(job_id)
                thumb_exists = object_exists(s3, bucket, thumb_key)

                if args.dry_run:
                    print(f"DRY-RUN thumbnail: job_id={job_id} key={thumb_key} exists={thumb_exists}")
                else:
                    if not thumb_exists:
                        upload_file(s3, bucket, thumb_path, thumb_key, "image/jpeg")
                        print(f"UPLOADED thumbnail: job_id={job_id} key={thumb_key}")
                        uploaded_thumbs += 1

                    db.jobs.update_one(
                        {"job_id": job_id},
                        {"$set": {"thumbnail_object_key": thumb_key}},
                    )
                    db.lectures.update_one(
                        {"source_job_id": job_id},
                        {"$set": {"thumbnailBlobKey": thumb_key}},
                    )

    print("--- SUMMARY ---")
    print(f"scanned={scanned}")
    print(f"uploaded_videos={uploaded_videos}")
    print(f"uploaded_thumbnails={uploaded_thumbs}")
    print(f"skipped_missing_local={skipped_missing}")


if __name__ == "__main__":
    main()
