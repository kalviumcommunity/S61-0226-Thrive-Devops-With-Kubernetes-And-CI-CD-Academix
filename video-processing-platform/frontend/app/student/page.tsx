import { Clock3, Search } from "lucide-react";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import { lectures } from "./lectures";

const subjects = ["All Subjects", "Computer Science", "Mathematics", "Business", "UX Design"];

export default function StudentLibraryPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
      <Navbar active="library" />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-5xl font-bold tracking-tight text-slate-900">My Learning Library</h1>
              <p className="mt-1 text-2xl text-slate-500">
                Continue where you left off and explore new topics.
              </p>
            </div>

            <label className="mt-1 flex h-12 w-full max-w-sm items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-slate-400 shadow-sm">
              <Search className="h-5 w-5" />
              <input
                type="text"
                placeholder="Search lectures..."
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {subjects.map((subject, index) => (
              <button
                key={subject}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                  index === 0
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {subject}
              </button>
            ))}
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {lectures.map((lecture) => (
              <article
                key={lecture.title}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="relative h-48 w-full">
                  <img src={lecture.image} alt={lecture.title} className="h-full w-full object-cover" />
                  <span className="absolute bottom-3 right-3 rounded-md bg-slate-900/90 px-2 py-1 text-xs font-semibold text-white">
                    {lecture.duration}
                  </span>
                </div>

                <div className="p-5">
                  <h2 className="line-clamp-1 text-4xl font-bold text-slate-900">{lecture.title}</h2>
                  <p className="mt-2 min-h-14 text-xl text-slate-500">{lecture.description}</p>

                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <Clock3 className="h-3.5 w-3.5" />
                      Updated 2 days ago
                    </span>
                    <Link
                      href={`/student/${lecture.slug}`}
                      className="text-sm font-bold uppercase tracking-wide text-indigo-700 hover:text-indigo-800"
                    >
                      Watch now
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-400">
        © 2026 Academix Learning Platform. Built for the future of education.
      </footer>
    </div>
  );
}