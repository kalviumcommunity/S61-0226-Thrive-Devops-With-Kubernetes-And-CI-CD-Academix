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
import Image from "next/image";
import { notFound } from "next/navigation";
import Navbar from "../../../components/Navbar";
import { fetchLecture, resolveApiUrl } from "../lectures";

type LecturePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function LecturePage({ params }: LecturePageProps) {
  const { slug } = await params;
  let lecture;

  try {
    lecture = await fetchLecture(slug);
  } catch {
    notFound();
  }

  const videoSrc = resolveApiUrl(lecture.videoUrl);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Navbar active="library" />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-6 py-6 lg:py-8">
          <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-rose-700 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <AlertCircle className="h-4 w-4" />
                  AI Enhancement Failed
                </p>
                <p className="mt-1 text-xs">AI Quota exceeded. Please wait a few seconds and try again.</p>
              </div>

              <button className="rounded-lg border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">
                <RefreshCcw className="mr-1 inline h-4 w-4" />
                Retry
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-black shadow-sm">
                {videoSrc ? (
                  <video
                    src={videoSrc}
                    controls
                    className="h-[220px] w-full object-cover md:h-[300px] lg:h-[360px]"
                  />
                ) : (
                  <>
                    <Image
                      src={lecture.image}
                      alt={lecture.title}
                      fill
                      sizes="(max-width: 1024px) 100vw, 720px"
                      className="object-cover opacity-65"
                      priority
                    />
                    <button className="absolute left-1/2 top-1/2 inline-flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm">
                      <Play className="ml-1 h-9 w-9 fill-white" />
                    </button>
                  </>
                )}

                <div className="absolute bottom-6 left-1/2 hidden w-[82%] -translate-x-1/2 rounded-xl border border-white/15 bg-black/40 px-6 py-4 text-center text-xl font-semibold leading-tight text-white backdrop-blur-sm md:block lg:bottom-10 lg:text-2xl">
                  The interaction between these two distributed nodes creates a unique synergy...
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
                <h1 className="max-w-3xl text-2xl font-bold tracking-tight text-slate-900 md:text-4xl">{lecture.title}</h1>
                <button className="rounded-lg bg-indigo-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-800">
                  Add to Playlist
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 text-amber-500">
                  <WandSparkles className="h-4 w-4" />
                  AI Enhanced
                </span>
                <span>•</span>
                <span>Published {lecture.publishedDate}</span>
                <span>•</span>
                <span>{lecture.views}</span>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 md:text-xl">
                  <Shield className="h-4 w-4 text-indigo-500" />
                  About this Lecture
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 md:text-base">{lecture.description}</p>
              </div>
            </div>

            <aside>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                <button className="flex-1 rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200">
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" /> AI Notes
                  </span>
                </button>
                <button className="flex-1 rounded-md px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">
                  <span className="inline-flex items-center gap-1.5">
                    <MessageSquareText className="h-4 w-4" /> Transcript
                  </span>
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="bg-amber-100/80 px-4 py-3">
                  <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-800 md:text-xl">
                    <Sparkles className="h-5 w-5 text-amber-500" />
                    Lecture Summary
                  </h3>
                </div>
                <p className="px-4 py-4 text-sm italic leading-relaxed text-slate-600 md:text-base">{lecture.aiSummary}</p>
              </div>

              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <span>Key Concepts</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-600">
                    Identified
                  </span>
                </div>

                <div className="space-y-3">
                  {lecture.keyConcepts.map((concept) => (
                    <div
                      key={concept.title}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/40"
                    >
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                          <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                        <p className="text-xs font-semibold text-slate-700">{concept.title}</p>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-400">{concept.timestamp}</span>
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
