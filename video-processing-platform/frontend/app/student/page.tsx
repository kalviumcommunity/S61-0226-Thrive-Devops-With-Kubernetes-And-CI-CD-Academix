import { Clock3, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import Footer from "../../components/Footer";
import Navbar from "../../components/Navbar";
import { fetchLectures } from "./lectures";

const subjects = ["All Subjects", "Computer Science", "Mathematics", "Business", "UX Design"];

type StudentLibraryPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function StudentLibraryPage({ searchParams }: StudentLibraryPageProps) {
  const { q } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  let lectures = [] as Awaited<ReturnType<typeof fetchLectures>>;
  let loadError: string | null = null;

  try {
    lectures = await fetchLectures();
  } catch {
    loadError = "Lecture service is currently unavailable. Please try again shortly.";
  }

  const filteredLectures = query
    ? lectures.filter(
        (lecture) =>
          lecture.title.toLowerCase().includes(query) ||
          lecture.description.toLowerCase().includes(query),
      )
    : lectures;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Navbar active="library" />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-6 py-6 lg:py-8">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-indigo-50/40 p-5 shadow-sm md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-2xl">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">My Learning Library</h1>
                <p className="mt-2 text-base leading-relaxed text-slate-600 md:text-lg">
                  Continue where you left off and explore new topics.
                </p>
              </div>

              <form className="w-full max-w-sm" action="/student" method="GET">
                <label className="group mt-1 flex h-10 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-slate-400 shadow-sm transition focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-100">
                  <Search className="h-4 w-4 transition group-focus-within:text-indigo-600" />
                  <input
                    type="text"
                    name="q"
                    defaultValue={q ?? ""}
                    placeholder="Search lectures..."
                    className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </label>
              </form>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {subjects.map((subject, index) => (
                <button
                  key={subject}
                  className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
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

          {filteredLectures.length > 0 ? (
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredLectures.map((lecture) => (
                <article
                  key={lecture.slug}
                  className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="relative h-40 w-full">
                    <Image
                      src={lecture.image}
                      alt={lecture.title}
                      fill
                      sizes="(max-width: 1280px) 100vw, 400px"
                      className="object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/30 to-transparent" />
                    <span className="absolute bottom-3 right-3 rounded-md bg-slate-900/90 px-2 py-1 text-xs font-semibold text-white">
                      {lecture.duration}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="line-clamp-2 text-lg font-semibold leading-snug text-slate-900 md:text-xl">{lecture.title}</h2>
                    <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-relaxed text-slate-600">{lecture.description}</p>

                    <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        <Clock3 className="h-3.5 w-3.5" />
                        Updated 2 days ago
                      </span>
                      <Link
                        href={`/student/${lecture.slug}`}
                        className="text-xs font-bold uppercase tracking-wide text-indigo-700 transition group-hover:text-indigo-800"
                      >
                        Watch now
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
              {query ? "No lectures found for your search." : "No lectures available yet."}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
