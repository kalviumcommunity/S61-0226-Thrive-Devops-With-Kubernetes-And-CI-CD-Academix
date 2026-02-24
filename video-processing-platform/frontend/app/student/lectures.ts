import { apiBaseUrl, fetchJson, resolveApiUrl } from "../../lib/api";

// Shared lecture model used by both student and admin pages.
export type Lecture = {
  slug: string;
  title: string;
  description: string;
  duration: string;
  image: string;
  publishedDate: string;
  views: string;
  aiSummary: string;
  videoUrl?: string | null;
  keyConcepts: Array<{
    title: string;
    timestamp: string;
  }>;
};

export type LectureUpdate = Partial<
  Pick<
    Lecture,
    "title" | "description" | "duration" | "image" | "publishedDate" | "views" | "aiSummary" | "videoUrl" | "keyConcepts"
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

export async function deleteLecture(slug: string): Promise<void> {
  await fetchJson<{ message: string }>(`${apiBaseUrl}/api/lectures/${slug}`, {
    method: "DELETE",
  });
}

export { apiBaseUrl, resolveApiUrl };
