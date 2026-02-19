export type Lecture = {
  slug: string;
  title: string;
  description: string;
  duration: string;
  image: string;
  publishedDate: string;
  views: string;
  aiSummary: string;
  keyConcepts: Array<{
    title: string;
    timestamp: string;
  }>;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
