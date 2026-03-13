export const SUBJECT_OPTIONS = [
  "All Subjects",
  "Computer Science",
  "Mathematics",
  "Business",
  "UX Design",
] as const;

export type SubjectOption = (typeof SUBJECT_OPTIONS)[number];

export function normalizeSubject(subject: string | undefined): SubjectOption {
  if (!subject) {
    return "All Subjects";
  }

  const match = SUBJECT_OPTIONS.find((item) => item.toLowerCase() === subject.toLowerCase());
  return match ?? "All Subjects";
}
