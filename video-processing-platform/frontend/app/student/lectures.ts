import { apiBaseUrl, fetchJson, resolveApiUrl } from "../../lib/api";

// Shared lecture model used by both student and admin pages.
export type Lecture = {
  slug: string;
  title: string;
  description: string;
  duration: string;
  // numeric seconds parsed by the server for convenience
  durationSeconds?: number;
  image: string;
  publishedDate: string;
  views: string;
  aiSummary: string;
  videoUrl?: string | null;
  keyConcepts: Array<{
    title: string;
    timestamp: string;
  }>;
  transcript?: Array<{
    timestamp: string;
    text: string;
  }>;
  progress?: Record<string, number>;
};

export type LectureUpdate = Partial<
  Pick<
    Lecture,
    "title" | "description" | "duration" | "image" | "publishedDate" | "views" | "aiSummary" | "videoUrl" | "keyConcepts" | "transcript"
  >
>;

export async function fetchLectures(): Promise<Lecture[]> {
  return await fetchJson<Lecture[]>(`${apiBaseUrl}/api/lectures`, {
    headers: {},
  });
}

export async function fetchLecture(slug: string): Promise<Lecture> {
  return await fetchJson<Lecture>(`${apiBaseUrl}/api/lectures/${slug}`, {
    headers: {},
  });
}

export async function updateLecture(slug: string, payload: LectureUpdate): Promise<Lecture> {
  return await fetchJson<Lecture>(`${apiBaseUrl}/api/lectures/${slug}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchProgress(slug: string, userId: string): Promise<{ progress: number }> {
  return await fetchJson<{ progress: number }>(`${apiBaseUrl}/api/lectures/${slug}/progress/${userId}`, {
    headers: {},
  });
}

export async function updateProgress(slug: string, userId: string, seconds: number): Promise<{ progress: number }> {
  return await fetchJson<{ progress: number }>(`${apiBaseUrl}/api/lectures/${slug}/progress`, {
    method: "POST",
    body: JSON.stringify({ userId, seconds }),
  });
}

export async function deleteLecture(slug: string): Promise<void> {
  await fetchJson<{ message: string }>(`${apiBaseUrl}/api/lectures/${slug}`, {
    method: "DELETE",
  });
}

export { apiBaseUrl, resolveApiUrl };
