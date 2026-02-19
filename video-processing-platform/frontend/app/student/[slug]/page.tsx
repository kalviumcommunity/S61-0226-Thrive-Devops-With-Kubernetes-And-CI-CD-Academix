import {
  AlertCircle,
  ChevronRight,
  MessageSquareText,
  Play,
  RefreshCcw,
  Shield,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { notFound } from "next/navigation";
import Navbar from "../../../components/Navbar";
import { lectures } from "../lectures";

type LecturePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function LecturePage({ params }: LecturePageProps) {
  const { slug } = await params;
  const lecture = lectures.find((item) => item.slug === slug);

  if (!lecture) {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
      <Navbar active="library" />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-6 py-7">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-base font-semibold">
                  <AlertCircle className="h-4 w-4" />
                  AI Enhancement Failed
                </p>
                <p className="mt-1 text-sm">AI Quota exceeded. Please wait a few seconds and try again.</p>
              </div>

              <button className="rounded-lg border border-rose-200 bg-white px-4 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100">
                <RefreshCcw className="mr-1 inline h-4 w-4" />
                Retry
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="relative overflow-hidden rounded-3xl bg-black">
                <img src={lecture.image} alt={lecture.title} className="h-[380px] w-full object-cover opacity-65" />

                <button className="absolute left-1/2 top-1/2 inline-flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm">
                  <Play className="ml-1 h-9 w-9 fill-white" />
                </button>

                <div className="absolute bottom-14 left-1/2 w-[78%] -translate-x-1/2 rounded-xl border border-white/15 bg-black/40 px-6 py-4 text-center text-3xl font-semibold leading-tight text-white backdrop-blur-sm">
                  The interaction between these two distributed nodes creates a unique synergy...
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-5xl font-bold tracking-tight text-slate-900">{lecture.title}</h1>
                <button className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800">
                  Add to Playlist
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1 text-amber-500">
                  <WandSparkles className="h-4 w-4" />
                  AI Enhanced
                </span>
                <span>•</span>
                <span>Published {lecture.publishedDate}</span>
                <span>•</span>
                <span>{lecture.views}</span>
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-3xl font-semibold text-slate-800">
                  <Shield className="h-5 w-5 text-indigo-500" />
                  About this Lecture
                </h2>
                <p className="mt-3 text-xl text-slate-500">{lecture.description}</p>
              </div>
            </div>

            <aside>
              <div className="flex items-center gap-2 rounded-xl bg-white p-2 shadow-sm">
                <button className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" /> AI Notes
                  </span>
                </button>
                <button className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                  <span className="inline-flex items-center gap-1.5">
                    <MessageSquareText className="h-4 w-4" /> Transcript
                  </span>
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="bg-amber-100 px-5 py-4">
                  <h3 className="inline-flex items-center gap-2 text-3xl font-semibold text-slate-800">
                    <Sparkles className="h-5 w-5 text-amber-500" />
                    Lecture Summary
                  </h3>
                </div>
                <p className="px-5 py-5 text-2xl italic text-slate-500">{lecture.aiSummary}</p>
              </div>

              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-400">
                  <span>Key Concepts</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-600">
                    Identified
                  </span>
                </div>

                <div className="space-y-3">
                  {lecture.keyConcepts.map((concept) => (
                    <div
                      key={concept.title}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                          <ChevronRight className="h-4 w-4" />
                        </span>
                        <p className="text-sm font-semibold text-slate-700">{concept.title}</p>
                      </div>
                      <span className="text-xs font-semibold text-slate-400">{concept.timestamp}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-400">
        © 2026 Academix Learning Platform. Built for the future of education.
      </footer>
    </div>
  );
}
