"use client";

import VideoPlayer from "./VideoPlayer";

// purely visual wrapper around the raw video component. Timing state
// (currentTime/seekTime) is lifted up so a sibling component can
// observe/change it.
export default function VideoPlayerWrapper({
    src,
    slug,
    duration,
    onTimeUpdate,
    seekTime,
}: {
    src: string;
    slug: string;
    duration?: string;
    onTimeUpdate?: (seconds: number) => void;
    seekTime?: number;
}) {
    return (
        <div className="mb-6 overflow-hidden rounded-lg border border-slate-200 shadow-lg">
            <VideoPlayer
                src={src}
                slug={slug}
                duration={duration}
                onTimeUpdate={onTimeUpdate}
                seekTime={seekTime}
            />
        </div>
    );
}
