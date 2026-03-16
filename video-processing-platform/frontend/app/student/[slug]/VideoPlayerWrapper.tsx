"use client";

import { type Ref } from "react";
import VideoPlayer from "./VideoPlayer";
import type { VideoPlayerHandle } from "./VideoPlayer";

// purely visual wrapper around the raw video component. Timing state
// (currentTime/seekTime) is lifted up so a sibling component can
// observe/change it.
export default function VideoPlayerWrapper({
    src,
    slug,
    duration,
    onTimeUpdate,
    playerRef,
}: {
    src: string;
    slug: string;
    duration?: string;
    onTimeUpdate?: (seconds: number) => void;
    playerRef?: Ref<VideoPlayerHandle>;
}) {
    return (
        <div className="overflow-hidden">
            <VideoPlayer
                ref={playerRef}
                src={src}
                slug={slug}
                duration={duration}
                onTimeUpdate={onTimeUpdate}
            />
        </div>
    );
}
