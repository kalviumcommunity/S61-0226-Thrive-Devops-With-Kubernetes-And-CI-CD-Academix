"use client";

import { type SyntheticEvent, useRef, useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { updateLecture, fetchProgress, updateProgress } from "../lectures";

type VideoPlayerProps = {
  src: string;
  slug: string;
  duration?: string;
  onTimeUpdate?: (seconds: number) => void;
  seekTime?: number;
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

export default function VideoPlayer({ src, slug, duration, onTimeUpdate, seekTime }: VideoPlayerProps) {
  const [hasReportedView, setHasReportedView] = useState(false);
  const [hasSyncedDuration, setHasSyncedDuration] = useState(false);
  const syncingDurationRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { user } = useUser();
  const [resumeSeconds, setResumeSeconds] = useState<number | null>(null);

  // handle external seek requests
  useEffect(() => {
    if (
      seekTime !== undefined &&
      videoRef.current &&
      Math.abs((videoRef.current.currentTime || 0) - seekTime) > 0.5
    ) {
      videoRef.current.currentTime = seekTime;
    }
  }, [seekTime]);

  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
    const wsUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/^http/, "ws") +
      `/ws/progress/${slug}/${user.id}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.progress && videoRef.current) {
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

    if (resumeSeconds && videoRef.current) {
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
      className="h-[220px] w-full object-cover md:h-[300px] lg:h-[360px]"
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
}
