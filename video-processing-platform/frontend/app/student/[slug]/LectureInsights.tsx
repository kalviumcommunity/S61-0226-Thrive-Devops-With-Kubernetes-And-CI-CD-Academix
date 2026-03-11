"use client";

import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { ChevronRight, MessageSquareText, Sparkles } from "lucide-react";
import { apiBaseUrl } from "../lectures";

type KeyConcept = {
  title: string;
  timestamp: string;
};

type TranscriptSegment = {
  timestamp: string;
  text: string;
};

type LectureInsightsProps = {
  slug?: string; // optional, page will pass it
  aiSummary: string;
  keyConcepts: KeyConcept[];
  transcript: TranscriptSegment[];
  currentTime?: number;
  onSeek?: (seconds: number) => void;
};

export default function LectureInsights({ slug, aiSummary, keyConcepts, transcript, currentTime, onSeek }: LectureInsightsProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "transcript">("summary");
  const [searchTerm, setSearchTerm] = useState("");
  const [localTranscript, setLocalTranscript] = useState(transcript);
  const [regenerating, setRegenerating] = useState(false);

  // keep local copy in sync when parent changes
  useEffect(() => {
    setLocalTranscript(transcript);
  }, [transcript]);

  // if we arrive with no transcript at all, automatically request AI to generate one
  useEffect(() => {
    const shouldCreate = slug && (!transcript || transcript.length === 0);
    if (!shouldCreate) return;

    // don't block callers if they change later
    let cancelled = false;
    const makeTranscript = async () => {
      setRegenerating(true);
      try {
        const res = await fetch(`${apiBaseUrl}/api/lectures/${slug}/ai-transcript`, {
          method: "POST",
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data.transcript)) {
            setLocalTranscript(data.transcript);
          }
        }
      } catch (e) {
        console.error("initial transcript failed", e);
      }
      if (!cancelled) setRegenerating(false);
    };
    makeTranscript();
    return () => {
      cancelled = true;
    };
  }, [slug, transcript]);

  // helper to parse timestamp string to seconds
  const parseTimestamp = (ts: string): number => {
    const parts = ts.split(":").map((p) => parseInt(p, 10));
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  };

  const escapeRegExp = (value: string): string => value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

  const highlightTranscriptText = (text: string, term: string): ReactNode => {
    if (!term.trim()) {
      return text;
    }

    const parts = text.split(new RegExp(`(${escapeRegExp(term.trim())})`, "ig"));
    return parts.map((part, index) =>
      index % 2 === 1 ? (
        <mark key={`${part}-${index}`} className="rounded bg-amber-200 px-0.5 text-slate-900">
          {part}
        </mark>
      ) : (
        <span key={`${part}-${index}`}>{part}</span>
      ),
    );
  };

  const normalizedTranscript = useMemo(() => {
    if (regenerating && (!localTranscript || localTranscript.length === 0)) {
      return [{ timestamp: "00:00", text: "Generating transcript, please wait..." }];
    }
    if (localTranscript && localTranscript.length > 0) {
      return localTranscript;
    }
    return [{ timestamp: "00:00", text: "Transcript is being prepared for this lecture." }];
  }, [localTranscript, regenerating]);

  const [liveSummary, setLiveSummary] = useState<string>("");
  const [liveConcepts, setLiveConcepts] = useState<KeyConcept[]>([]);

  // fetch live AI notes when currentTime changes (throttled by 5s via simple timer)
  useEffect(() => {
    if (!slug || currentTime == null) return;
    const ms = Date.now();
    let cancelled = false;
    const doFetch = async () => {
      try {
        const summaryResp = await fetch(
          `${apiBaseUrl}/api/lectures/${slug}/live-summary?timestamp=${currentTime}`
        );
        const summaryData = await summaryResp.json();
        if (!cancelled && summaryData.summary) setLiveSummary(summaryData.summary);
        const conceptsResp = await fetch(
          `${apiBaseUrl}/api/lectures/${slug}/live-concepts?timestamp=${currentTime}`
        );
        const conceptsData = await conceptsResp.json();
        if (!cancelled && Array.isArray(conceptsData.keyConcepts)) {
          setLiveConcepts(conceptsData.keyConcepts);
        }
      } catch (e) {
        // ignore any fetch errors
      }
    };

    // basic rate limiting: wait 5 seconds before each request
    const timer = setTimeout(doFetch, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug, currentTime]);

  const activeIdx = useMemo(() => {
    if (currentTime == null) return -1;
    let idx = -1;
    for (let i = 0; i < normalizedTranscript.length; i++) {
      const start = parseTimestamp(normalizedTranscript[i].timestamp);
      const end =
        i + 1 < normalizedTranscript.length
          ? parseTimestamp(normalizedTranscript[i + 1].timestamp)
          : start + 5;
      if (currentTime >= start && currentTime < end) {
        idx = i;
        break;
      }
    }
    return idx;
  }, [currentTime, normalizedTranscript]);

  const transcriptRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (transcriptRef.current && activeIdx >= 0) {
      const child = transcriptRef.current.children[activeIdx] as HTMLElement;
      if (child) {
        child.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeIdx]);

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredTranscript = useMemo(() => {
    const withIndex = normalizedTranscript.map((segment, originalIndex) => ({ segment, originalIndex }));
    if (!normalizedSearchTerm) return withIndex;

    return withIndex.filter(({ segment }) =>
      segment.text.toLowerCase().includes(normalizedSearchTerm),
    );
  }, [normalizedTranscript, normalizedSearchTerm]);

  const matchSummary = useMemo(() => {
    const total = normalizedTranscript.length;
    const matched = filteredTranscript.length;
    if (!normalizedSearchTerm) {
      return `Showing all ${total} segments`;
    }
    return `Matched ${matched} of ${total} segments`;
  }, [normalizedTranscript.length, filteredTranscript.length, normalizedSearchTerm]);

  const exportTranscript = async (slug: string, format: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/lectures/${slug}/transcript/export?format=${format}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("export failed", e);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 overflow-hidden">
        <button
          type="button"
          onClick={() => setActiveTab("summary")}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors duration-150 ${
            activeTab === "summary"
              ? "bg-purple-50 text-purple-700 border-b-2 border-purple-600"
              : "text-slate-500 hover:bg-purple-50"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> AI Notes
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("transcript")}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors duration-150 ${
            activeTab === "transcript"
              ? "bg-purple-50 text-purple-700 border-b-2 border-purple-600"
              : "text-slate-500 hover:bg-purple-50"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <MessageSquareText className="h-5 w-5" /> Transcript
          </span>
        </button>
      </div>

      {activeTab === "summary" ? (
        <div className="mt-4">
          <div className="bg-amber-100/80 px-5 py-4 rounded-md">
            <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-800">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Lecture Summary
            </h3>
          </div>
          <div className="mt-2 px-5 py-4 text-sm leading-relaxed text-slate-600">
            <p className="italic">{aiSummary}</p>
            {liveSummary ? (
              <div className="mt-4 rounded-lg border-l-4 border-purple-600 bg-purple-50 p-4 text-slate-800">
                <strong>Live notes:</strong> {liveSummary}
              </div>
            ) : null}
            {liveConcepts.length > 0 ? (
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Live concepts</div>
                <ul className="grid grid-cols-1 gap-1 text-sm text-slate-700 sm:grid-cols-2">
                  {liveConcepts.map((c) => (
                    <li key={c.title}>{c.title}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="sticky top-0 z-10 bg-purple-50/60 backdrop-blur px-4 py-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-800 md:text-xl">
                <MessageSquareText className="h-5 w-5 text-purple-600" />
                Transcript
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                {slug && (
                  <button
                    onClick={async () => {
                      // explicit regeneration (or initial request if needed)
                      setRegenerating(true);
                      try {
                        const res = await fetch(`${apiBaseUrl}/api/lectures/${slug}/ai-transcript`, {
                          method: "POST",
                        });
                        if (res.ok) {
                          const data = await res.json();
                          if (Array.isArray(data.transcript)) {
                            setLocalTranscript(data.transcript);
                          }
                        }
                      } catch (e) {
                        console.error("regenerate failed", e);
                      }
                      setRegenerating(false);
                    }}
                    disabled={regenerating}
                    className="text-sm font-medium text-purple-700 hover:text-purple-800"
                  >
                    {regenerating ? "Regenerating..." : "Improve with AI"}
                  </button>
                )}
                <input
                  type="text"
                  placeholder="search transcript..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="rounded-md border px-2 py-1 text-xs"
                />
                {searchTerm ? (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="text-xs text-slate-500 underline hover:text-slate-700"
                  >
                    Clear
                  </button>
                ) : null}
                {slug ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => exportTranscript(slug, "txt")}
                      className="text-xs text-indigo-600 underline"
                    >
                      TXT
                    </button>
                    <button
                      onClick={() => exportTranscript(slug, "srt")}
                      className="text-xs text-indigo-600 underline"
                    >
                      SRT
                    </button>
                  </div>
                ) : null}
                <button
                  onClick={() => {
                    const allText = normalizedTranscript.map((s) => `${s.timestamp} ${s.text}`).join("\n");
                    navigator.clipboard.writeText(allText).catch(() => {});
                  }}
                  className="text-xs text-indigo-600 underline"
                  title="Copy entire transcript"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            {matchSummary}
          </div>
          <div ref={transcriptRef} className="max-h-64 space-y-3 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-purple-300 scrollbar-track-purple-50">
            {filteredTranscript.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">
                No matching transcript entries.
              </div>
            ) : (
              filteredTranscript.map(({ segment, originalIndex }) => {
                const isActive = originalIndex === activeIdx;
                return (
                  <div
                    key={`${segment.timestamp}-${segment.text.slice(0, 24)}`}
                    onClick={() => onSeek && onSeek(parseTimestamp(segment.timestamp))}
                    className={`rounded-md border p-3 transition cursor-pointer ${
                      isActive
                        ? "border-purple-500 bg-purple-100"
                        : "border-slate-100 bg-white hover:bg-purple-50"
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
                      {segment.timestamp}
                    </p>
                    <p
                      className="mt-1 text-sm leading-relaxed text-slate-700"
                    >
                      {highlightTranscriptText(segment.text, searchTerm)}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-400">
          <span>Key Concepts</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-600">
            Identified
          </span>
        </div>

        <div className="space-y-3">
          {keyConcepts.length > 0 ? (
            keyConcepts.map((concept) => (
              <div
                key={concept.title}
                onClick={() => onSeek && onSeek(parseTimestamp(concept.timestamp))}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm transition hover:border-purple-200 hover:bg-purple-50/40 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-xs font-semibold text-slate-700">{concept.title}</p>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">{concept.timestamp}</span>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
              No key concepts identified yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
