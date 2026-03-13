"use client";

import { Clock3 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Lecture } from "./lectures";
import { resolveApiUrl } from "./lectures";

type LectureCardProps = {
  lecture: Lecture;
  userId?: string;
};

function formatSeconds(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function LectureCard({ lecture, userId }: LectureCardProps) {
  const [durationLabel, setDurationLabel] = useState(lecture.duration);

  const progressPercent = useMemo(() => {
    if (!userId || !lecture.progress || !lecture.progress[userId]) {
      return 0;
    }

    const totalDuration = lecture.durationSeconds && lecture.durationSeconds > 0 ? lecture.durationSeconds : 1;
    return (lecture.progress[userId] / totalDuration) * 100;
  }, [lecture.durationSeconds, lecture.progress, userId]);

  const handleLoadedMetadata = (duration: number) => {
    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }

    const nextLabel = formatSeconds(duration);
    setDurationLabel(nextLabel);
  };

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative h-40 w-full">
        {lecture.videoUrl ? (
          <video
            src={resolveApiUrl(lecture.videoUrl)}
            poster={resolveApiUrl(lecture.image) ?? undefined}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            onLoadedMetadata={(event) => handleLoadedMetadata(event.currentTarget.duration)}
          />
        ) : (
          <Image
            src={lecture.image}
            alt={lecture.title}
            fill
            sizes="(max-width: 1280px) 100vw, 400px"
            className="object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/30 to-transparent" />
        {progressPercent > 0 ? (
          <div className="absolute bottom-0 left-0 h-1.5 w-full bg-indigo-100">
            <div className="h-full bg-indigo-600 transition-width duration-200" style={{ width: `${progressPercent}%` }} />
          </div>
        ) : null}
        <span className="absolute bottom-3 right-3 rounded-lg bg-slate-900/90 px-2 py-1 text-xs font-semibold text-white">
          {durationLabel}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5 md:p-6">
        {lecture.subject ? (
          <span className="mb-2 inline-flex w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            {lecture.subject}
          </span>
        ) : null}
        <h2 className="line-clamp-2 text-lg font-semibold leading-snug text-slate-900 md:text-xl">{lecture.title}</h2>
        <p className="mt-2 line-clamp-3 min-h-14 text-sm leading-relaxed text-slate-600">{lecture.description}</p>
        {userId && lecture.progress && lecture.progress[userId] > 0 ? (
          <p className="mt-2 text-xs font-medium text-indigo-600">Progress: {lecture.progress[userId].toFixed(0)}s</p>
        ) : null}

        <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Clock3 className="h-3.5 w-3.5" />
            Updated 2 days ago
          </span>
          <Link
            href={`/student/${lecture.slug}`}
            className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700 transition group-hover:border-indigo-200 group-hover:bg-indigo-100"
          >
            Watch now
          </Link>
        </div>
      </div>
    </article>
  );
}
