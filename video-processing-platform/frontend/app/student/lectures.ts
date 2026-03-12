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
  filename?: string | null;
  source_job_id?: string;
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
  lastAction?: "linked" | "edited" | "deleted";
};

export type LectureUpdate = Partial<
  Pick<
    Lecture,
    | "title"
    | "description"
    | "duration"
    | "image"
    | "publishedDate"
    | "views"
    | "aiSummary"
    | "videoUrl"
    | "keyConcepts"
    | "transcript"
    | "isDeleted"
    | "lastAction"
  >
>;

type FetchLecturesOptions = {
  includeDeleted?: boolean;
};

export async function fetchLectures(query?: string, options?: FetchLecturesOptions): Promise<Lecture[]> {
  const params = new URLSearchParams();
  const trimmedQuery = query?.trim();

  if (trimmedQuery) {
    params.set("q", trimmedQuery);
  }

  if (options?.includeDeleted) {
    params.set("includeDeleted", "true");
  }

  const queryString = params.toString();
  const endpoint = queryString ? `${apiBaseUrl}/api/lectures?${queryString}` : `${apiBaseUrl}/api/lectures`;

  return await fetchJson<Lecture[]>(endpoint);
}

export async function fetchLecture(slug: string): Promise<Lecture> {
  return await fetchJson<Lecture>(`${apiBaseUrl}/api/lectures/${slug}`);
}

export async function updateLecture(slug: string, payload: LectureUpdate): Promise<Lecture> {
  return await fetchJson<Lecture>(`${apiBaseUrl}/api/lectures/${slug}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchProgress(slug: string, userId: string): Promise<{ progress: number }> {
  return await fetchJson<{ progress: number }>(`${apiBaseUrl}/api/lectures/${slug}/progress/${userId}`);
}

export async function updateProgress(slug: string, userId: string, seconds: number): Promise<{ progress: number }> {
  return await fetchJson<{ progress: number }>(`${apiBaseUrl}/api/lectures/${slug}/progress`, {
    method: "POST",
    body: JSON.stringify({ userId, seconds }),
  });
}

export { apiBaseUrl, resolveApiUrl };
