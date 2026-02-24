"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";

type VideoPlayerProps = {
  src: string;
  slug: string;
};

export default function VideoPlayer({ src, slug }: VideoPlayerProps) {
  const [hasReportedView, setHasReportedView] = useState(false);
  const { user } = useUser();

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

  return (
    <video
      controls
      className="h-[220px] w-full object-cover md:h-[300px] lg:h-[360px]"
      src={src}
      preload="metadata"
      onPlay={handlePlay}
    />
  );
}
