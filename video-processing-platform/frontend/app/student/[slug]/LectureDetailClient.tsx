"use client";

import { useState } from "react";
import { ArrowRight, Shield, WandSparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import LectureInsights from "./LectureInsights";
import VideoPlayerWrapper from "./VideoPlayerWrapper";
import { Lecture } from "../lectures";

export type LectureDetailClientProps = {
    lecture: Lecture;
    nextLecture?: Lecture;
    videoSrc?: string | null;
};

export default function LectureDetailClient({
    lecture,
    nextLecture,
    videoSrc,
}: LectureDetailClientProps) {
    const [currentTime, setCurrentTime] = useState(0);
    const [seekTime, setSeekTime] = useState<number | undefined>(undefined);

    const handleSeek = (s: number) => {
        setSeekTime(s);
    };

    return (
        <div className="grid gap-5 lg:grid-cols-3">
            {/* left column video + metadata */}
            <div className="lg:col-span-2">
                <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-black shadow-sm">
                    {videoSrc ? (
                        <VideoPlayerWrapper
                            src={videoSrc}
                            slug={lecture.slug}
                            duration={lecture.duration}
                            onTimeUpdate={setCurrentTime}
                            seekTime={seekTime}
                        />
                    ) : (
                        <Image
                            src={lecture.image}
                            alt={lecture.title}
                            fill
                            sizes="(max-width: 1024px) 100vw, 720px"
                            className="object-cover opacity-65"
                            priority
                        />
                    )}
                </div>

                <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
                    <h1 className="max-w-3xl text-2xl font-bold tracking-tight text-slate-900 md:text-4xl">
                        {lecture.title}
                    </h1>
                    {nextLecture ? (
                        <Link
                            href={`/student/${nextLecture.slug}`}
                            className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-800"
                        >
                            Continue Learning
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    ) : (
                        <Link
                            href="/student"
                            className="rounded-lg bg-indigo-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-800"
                        >
                            Back to Library
                        </Link>
                    )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 text-amber-500">
                        <WandSparkles className="h-4 w-4" />
                        AI Enhanced
                    </span>
                    <span>•</span>
                    <span>Published {lecture.publishedDate}</span>
                    <span>•</span>
                    <span>{lecture.views}</span>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 md:text-xl">
                        <Shield className="h-4 w-4 text-indigo-500" />
                        About this Lecture
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600 md:text-base">
                        {lecture.description}
                    </p>
                </div>
            </div>

            {/* right column insights */}
            <div className="lg:col-span-1">
                <LectureInsights
                    slug={lecture.slug}
                    aiSummary={lecture.aiSummary}
                    keyConcepts={lecture.keyConcepts}
                    transcript={lecture.transcript ?? []}
                    currentTime={currentTime}
                    onSeek={handleSeek}
                />
            </div>
        </div>
    );
}
