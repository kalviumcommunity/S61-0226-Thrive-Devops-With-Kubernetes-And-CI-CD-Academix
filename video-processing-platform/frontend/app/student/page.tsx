import Footer from "../../components/Footer";
import Navbar from "../../components/Navbar";
import { fetchLectures } from "./lectures";
import { currentUser } from "@clerk/nextjs/server";
import SearchLecturesInput from "./SearchLecturesInput";
import LectureCard from "./LectureCard";

const subjects = ["All Subjects", "Computer Science", "Mathematics", "Business", "UX Design"];

type StudentLibraryPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function StudentLibraryPage({ searchParams }: StudentLibraryPageProps) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  let lectures = [] as Awaited<ReturnType<typeof fetchLectures>>;
  let loadError: string | null = null;

  // get optional current user to show progress
  const user = await currentUser();

  try {
    lectures = await fetchLectures(query);
  } catch {
    loadError = "Lecture service is currently unavailable. Please try again shortly.";
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Navbar active="library" />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 py-6 md:py-8">
          <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-white to-indigo-50/50 p-5 shadow-sm md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-2xl">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">My Learning Library</h1>
                <p className="mt-2 text-base leading-relaxed text-slate-600 md:text-lg">
                  Continue where you left off and explore new topics.
                </p>
              </div>

              <div className="w-full max-w-sm">
                <SearchLecturesInput initialQuery={q ?? ""} />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2.5">
              {subjects.map((subject, index) => (
                <button
                  key={subject}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                    index === 0
                      ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                  }`}
                >
                  {subject}
                </button>
              ))}
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
              {query ? "No lectures found for your search." : "No lectures available yet."}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
