"use client";

import { type SyntheticEvent, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { updateLecture, fetchProgress, updateProgress } from "../lectures";

export type VideoPlayerHandle = {
  seekTo: (seconds: number) => void;
};

type VideoPlayerProps = {
  src: string;
  slug: string;
  duration?: string;
  onTimeUpdate?: (seconds: number) => void;
};

function formatDurationFromSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  { src, slug, duration, onTimeUpdate }: VideoPlayerProps,
  ref,
) {
  const [hasReportedView, setHasReportedView] = useState(false);
  const [hasSyncedDuration, setHasSyncedDuration] = useState(false);
  const syncingDurationRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSeekAtRef = useRef<number>(0); // ms timestamp of last user-initiated seek
  const pendingSeekRef = useRef<number | null>(null);
  const { user } = useUser();
  const [resumeSeconds, setResumeSeconds] = useState<number | null>(null);

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      lastSeekAtRef.current = Date.now();
      pendingSeekRef.current = seconds;

      const video = videoRef.current;
      if (!video) {
        return;
      }

      if (video.readyState >= 1) {
        video.currentTime = seconds;
        pendingSeekRef.current = null;
      }
    },
  }), []);

  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

  const handlePlay = async () => {
    if (hasReportedView) {
      return;
    }

    // Report view once per session to avoid duplicate increments on pause/replay.
    setHasReportedView(true);

    try {
      const userId = user?.id ?? "anonymous";
      await fetch(`${apiBaseUrl}/api/lectures/${slug}/view`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });
    } catch (error) {
      console.error("Failed to register lecture view", error);
    }
  };

  // fetch resume position once when video is ready
  useEffect(() => {
    if (!user || !slug) return;

    fetchProgress(slug, user.id)
      .then((data) => {
        if (data && data.progress > 0) {
          setResumeSeconds(data.progress);
        }
      })
      .catch((e) => console.error("error fetching progress", e));
  }, [slug, user]);

  // periodically send currentTime and call callback for live transcript
  useEffect(() => {
    const interval = setInterval(async () => {
      if (videoRef.current) {
        const current = videoRef.current.currentTime;
        if (onTimeUpdate) {
          onTimeUpdate(current);
        }
        if (user && slug) {
          try {
            await updateProgress(slug, user.id, current);
          } catch (e) {
            console.error("error updating progress", e);
          }
        }
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [slug, user, onTimeUpdate]);

  // open websocket for realtime progress (allows sync across tabs/devices)
  useEffect(() => {
    if (!user || !slug) return;
    const wsUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001").replace(/^http/, "ws") +
      `/ws/progress/${slug}/${user.id}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        // ignore WS position updates for 2s after a user-initiated seek to prevent snap-back
        if (data.progress && videoRef.current && Date.now() - lastSeekAtRef.current > 2000) {
          videoRef.current.currentTime = data.progress;
        }
      } catch (e) {
        console.error("ws parse error", e);
      }
    };
    ws.onclose = () => console.log("progress websocket closed");
    return () => ws.close();
  }, [slug, user]);

  const handleLoadedMetadata = async (event: SyntheticEvent<HTMLVideoElement>) => {
    if (hasSyncedDuration || syncingDurationRef.current) {
      return;
    }

    const videoElement = event.currentTarget;
    const seconds = videoElement.duration;

    if (pendingSeekRef.current != null) {
      videoElement.currentTime = pendingSeekRef.current;
      pendingSeekRef.current = null;
    } else if (resumeSeconds && videoRef.current) {
      videoRef.current.currentTime = resumeSeconds;
      setResumeSeconds(null);
    }

    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }

    const actualDuration = formatDurationFromSeconds(seconds);
    if (actualDuration === duration) {
      setHasSyncedDuration(true);
      return;
    }

    syncingDurationRef.current = true;
    try {
      await updateLecture(slug, { duration: actualDuration });
      setHasSyncedDuration(true);
    } catch (error) {
      console.error("Failed to sync lecture duration", error);
    } finally {
      syncingDurationRef.current = false;
    }
  };

  return (
    <video
      ref={videoRef}
      controls
      className="w-full aspect-video bg-black object-contain"
      src={src}
      preload="metadata"
      onPlay={handlePlay}
      onLoadedMetadata={handleLoadedMetadata}
      onTimeUpdate={() => {
        if (videoRef.current && onTimeUpdate) {
          onTimeUpdate(videoRef.current.currentTime);
        }
      }}
    >
      {slug && (
        <track
          kind="captions"
          src={`${apiBaseUrl}/api/lectures/${slug}/transcript/export?format=vtt`}
          default
        />
      )}
    </video>
  );
});

export default VideoPlayer;
