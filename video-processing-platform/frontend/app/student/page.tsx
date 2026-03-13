import Footer from "../../components/Footer";
import Navbar from "../../components/Navbar";
import { fetchLectures } from "./lectures";
import { currentUser } from "@clerk/nextjs/server";
import SearchLecturesInput from "./SearchLecturesInput";
import LectureCard from "./LectureCard";
import { normalizeSubject, SUBJECT_OPTIONS } from "../../lib/subjects";

type StudentLibraryPageProps = {
  searchParams: Promise<{ q?: string; subject?: string }>;
};

export default async function StudentLibraryPage({ searchParams }: StudentLibraryPageProps) {
  const { q, subject } = await searchParams;
  const query = (q ?? "").trim();
  const selectedSubject = normalizeSubject(subject);
  let lectures = [] as Awaited<ReturnType<typeof fetchLectures>>;
  let loadError: string | null = null;

  // get optional current user to show progress
  const user = await currentUser();

  try {
    lectures = await fetchLectures(query, { subject: selectedSubject });
  } catch {
    loadError = "Lecture service is currently unavailable. Please try again shortly.";
  }

  const getSubjectHref = (targetSubject: string) => {
    const params = new URLSearchParams();
    if (query) {
      params.set("q", query);
    }
    if (targetSubject !== "All Subjects") {
      params.set("subject", targetSubject);
    }
    const next = params.toString();
    return next ? `/student?${next}` : "/student";
  };

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_#e2e8f0_0%,_#f8fafc_35%,_#ffffff_100%)] text-slate-900">
      <Navbar active="library" />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-lg shadow-slate-200/40 backdrop-blur md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-2xl">
                <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                  Student Library
                </span>
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">My Learning Library</h1>
                <p className="mt-2 text-base leading-relaxed text-slate-600 md:text-lg">
                  Continue where you left off and explore new topics.
                </p>
              </div>

              <div className="w-full max-w-sm">
                <SearchLecturesInput initialQuery={q ?? ""} />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              {SUBJECT_OPTIONS.map((subjectOption) => {
                const isActive = selectedSubject === subjectOption;
                return (
                  <a
                    key={subjectOption}
                    href={getSubjectHref(subjectOption)}
                    className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    {subjectOption}
                  </a>
                );
              })}

              <span className="ml-auto rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                Showing: {selectedSubject}
              </span>
            </div>

            {loadError ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {loadError}
              </div>
            ) : null}
          </div>

          {lectures.length > 0 ? (
            <div className="mt-7 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {lectures.map((lecture) => (
                <LectureCard key={lecture.slug} lecture={lecture} userId={user?.id} />
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
              {query ? "No lectures found for your search." : `No lectures available for ${selectedSubject}.`}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
