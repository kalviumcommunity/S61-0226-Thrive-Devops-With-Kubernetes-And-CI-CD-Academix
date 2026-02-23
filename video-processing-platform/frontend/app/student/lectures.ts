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

export const apiBaseUrl =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

export function resolveApiUrl(url?: string | null): string | undefined {
  if (!url) {
    return undefined;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  if (url.startsWith("/")) {
    return `${apiBaseUrl}${url}`;
  }

  return `${apiBaseUrl}/${url}`;
}

export async function fetchLectures(): Promise<Lecture[]> {
  const response = await fetch(`${apiBaseUrl}/api/lectures`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to load lectures");
  }

  const payload = (await response.json()) as Lecture[];
  return payload;
}

export async function fetchLecture(slug: string): Promise<Lecture> {
  const response = await fetch(`${apiBaseUrl}/api/lectures/${slug}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Lecture not found");
  }

  const payload = (await response.json()) as Lecture;
  return payload;
}

export async function updateLecture(slug: string, payload: LectureUpdate): Promise<Lecture> {
  const response = await fetch(`${apiBaseUrl}/api/lectures/${slug}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Unable to update lecture");
  }

  return (await response.json()) as Lecture;
}

export async function deleteLecture(slug: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/lectures/${slug}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Unable to delete lecture");
  }
}
