"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  Clock,
  Film,
  History,
  RefreshCcw,
  RotateCcw,
  Search,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import Footer from "../../../components/Footer";
import Navbar from "../../../components/Navbar";
import { fetchDashboardSummary, retryJob, type AdminJob, type DashboardSummary } from "../../../lib/admin";
import { fetchLectures, type Lecture, updateLecture } from "../../student/lectures";

type LectureVisibilityFilter = "all" | "active" | "deleted";
type JobFilter = "all" | "active" | "completed" | "failed";
// Removed  = job completed/failed but lecture was hard-deleted from the DB
// Pending  = job is still active; lecture exists in DB but may not be indexed yet
type JobAction = "Linked" | "Edited" | "Deleted" | "Updated" | "Removed" | "Pending";

function formatRelativeTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  const seconds = Math.round((Date.now() - parsed.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getLinkedLecture(job: AdminJob, lectures: Lecture[]): Lecture | undefined {
  return lectures.find((lecture) => lecture.source_job_id === job.id || lecture.videoUrl?.includes(job.id));
}

function getJobAction(job: AdminJob, lectures: Lecture[]): JobAction {
  const lecture = getLinkedLecture(job, lectures);

  if (!lecture) {
    // Every upload creates a lecture immediately in the DB.
    // If no lecture is found for a completed/failed job, it was hard-deleted.
    const isSettled = job.status === "completed" || job.status === "failed";
    return isSettled ? "Removed" : "Pending";
  }
  if (lecture.isDeleted) return "Deleted";
  if (lecture.lastAction === "edited") return "Edited";
  if (lecture.updatedAt && lecture.createdAt && lecture.updatedAt !== lecture.createdAt) return "Updated";
  return "Linked";
}

const ACTION_META: Record<JobAction, { style: string; label: string; tip: string }> = {
  Linked:  { style: "bg-indigo-50 text-indigo-700",   label: "Linked",  tip: "Lecture is live in the student catalog" },
  Updated: { style: "bg-emerald-50 text-emerald-700", label: "Updated", tip: "Lecture metadata was updated after processing" },
  Edited:  { style: "bg-amber-50 text-amber-700",     label: "Edited",  tip: "Title or description was manually edited" },
  Deleted: { style: "bg-rose-50 text-rose-700",       label: "Deleted", tip: "Lecture is soft-deleted (hidden) — can be restored below" },
  Removed: { style: "bg-rose-100 text-rose-800 ring-1 ring-rose-200", label: "Removed", tip: "Lecture record was permanently deleted from the database" },
  Pending: { style: "bg-blue-50 text-blue-600",       label: "Pending", tip: "Job is still active; lecture will appear once processing completes" },
};

function getActionBadge(action: JobAction) {
  const { style, label, tip } = ACTION_META[action];
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${style}`}
      title={tip}
    >
      {label}
    </span>
  );
}

export default function JobMonitoringPage() {
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [selectedLectureSlug, setSelectedLectureSlug] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [backendWarning, setBackendWarning] = useState<string | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [mutatingLectureSlug, setMutatingLectureSlug] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [jobSearch, setJobSearch] = useState("");
  const [lectureSearch, setLectureSearch] = useState("");
  const [jobFilter, setJobFilter] = useState<JobFilter>("all");
  const [lectureFilter, setLectureFilter] = useState<LectureVisibilityFilter>("all");

  const deletedLectureCount = useMemo(
    () => lectures.filter((lecture) => lecture.isDeleted).length,
    [lectures],
  );

  const sortedLectures = useMemo(
    () => [...lectures].sort((left, right) => Number(Boolean(left.isDeleted)) - Number(Boolean(right.isDeleted))),
    [lectures],
  );

  const filteredLectures = useMemo(() => {
    const normalizedQuery = lectureSearch.trim().toLowerCase();

    return sortedLectures.filter((lecture) => {
      const matchesVisibility =
        lectureFilter === "all"
          ? true
          : lectureFilter === "deleted"
            ? Boolean(lecture.isDeleted)
            : !lecture.isDeleted;

      if (!matchesVisibility) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [lecture.title, lecture.description, lecture.slug].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [lectureFilter, lectureSearch, sortedLectures]);

  const jobCounts = useMemo(() => {
    const jobs = dashboardSummary?.recentJobs ?? [];
    return {
      all: jobs.length,
      active: jobs.filter((j) => j.status === "queued" || j.status === "processing").length,
      completed: jobs.filter((j) => j.status === "completed").length,
      failed: jobs.filter((j) => j.status === "failed").length,
    };
  }, [dashboardSummary?.recentJobs]);

  const filteredJobs = useMemo(() => {
    const normalizedQuery = jobSearch.trim().toLowerCase();

    return (dashboardSummary?.recentJobs ?? []).filter((job) => {
      const matchesFilter =
        jobFilter === "all"
          ? true
          : jobFilter === "active"
            ? job.status === "queued" || job.status === "processing"
            : job.status === jobFilter;

      if (!matchesFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const linkedLecture = getLinkedLecture(job, lectures);
      return [job.filename, job.id, linkedLecture?.title ?? "", linkedLecture?.slug ?? ""].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [dashboardSummary?.recentJobs, jobFilter, jobSearch, lectures]);

  const visibleJobStats = useMemo(() => {
    const total = filteredJobs.length;
    const active = filteredJobs.filter((job) => job.status === "queued" || job.status === "processing").length;
    const attention = filteredJobs.filter((job) => {
      const action = getJobAction(job, lectures);
      return job.status === "failed" || action === "Removed";
    }).length;
    const avgProgress =
      total > 0
        ? Math.round(filteredJobs.reduce((sum, job) => sum + Math.max(0, Math.min(100, job.progress)), 0) / total)
        : 0;

    return { total, active, attention, avgProgress };
  }, [filteredJobs, lectures]);

  const loadDashboardSummary = async () => {
    const payload = await fetchDashboardSummary();
    setDashboardSummary(payload);
  };

  const loadLectures = async () => {
    const payload = await fetchLectures(undefined, { includeDeleted: true });
    setLectures(payload);
  };

  const refreshPageData = async (withSpinner = false) => {
    try {
      if (withSpinner) {
        setIsRefreshing(true);
      }
      await Promise.all([loadDashboardSummary(), loadLectures()]);
      setBackendWarning(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load admin monitoring data.";
      setBackendWarning(message);
    } finally {
      if (withSpinner) {
        setIsRefreshing(false);
      }
    }
  };

  const refreshPageDataEvent = useEffectEvent((withSpinner = false) => {
    void refreshPageData(withSpinner);
  });

  useEffect(() => {
    refreshPageDataEvent();
  }, []);

  useEffect(() => {
    const poller = setInterval(() => {
      refreshPageDataEvent();
    }, 10000);

    return () => {
      clearInterval(poller);
    };
  }, []);

  const startEditLecture = (lecture: Lecture) => {
    setSelectedLectureSlug(lecture.slug);
    setEditTitle(lecture.title);
    setEditDescription(lecture.description);
    setFormError(null);
    setFormMessage(null);
  };

  const handleUpdateLecture = async () => {
    if (!selectedLectureSlug) {
      return;
    }

    try {
      setMutatingLectureSlug(selectedLectureSlug);
      await updateLecture(selectedLectureSlug, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        lastAction: "edited",
      });
      setLectures((current) =>
        current.map((lecture) =>
          lecture.slug === selectedLectureSlug
            ? {
                ...lecture,
                title: editTitle.trim(),
                description: editDescription.trim(),
                lastAction: "edited",
              }
            : lecture,
        ),
      );
      setSelectedLectureSlug(null);
      setEditTitle("");
      setEditDescription("");
      setFormMessage("Lecture updated successfully.");
      setFormError(null);
    } catch {
      setFormError("Could not update lecture details.");
    } finally {
      setMutatingLectureSlug(null);
    }
  };

  const handleDeleteLecture = async (slug: string) => {
    try {
      setMutatingLectureSlug(slug);
      await updateLecture(slug, { isDeleted: true, lastAction: "deleted" });
      setLectures((current) =>
        current.map((lecture) =>
          lecture.slug === slug ? { ...lecture, isDeleted: true, lastAction: "deleted" } : lecture,
        ),
      );
      if (selectedLectureSlug === slug) {
        setSelectedLectureSlug(null);
        setEditTitle("");
        setEditDescription("");
      }
      setFormMessage("Lecture deleted.");
      setFormError(null);
      await refreshPageData();
    } catch {
      setFormError("Could not delete lecture.");
    } finally {
      setMutatingLectureSlug(null);
    }
  };

  const handleRestoreLecture = async (slug: string) => {
    try {
      setMutatingLectureSlug(slug);
      await updateLecture(slug, { isDeleted: false, lastAction: "edited" });
      setLectures((current) =>
        current.map((lecture) =>
          lecture.slug === slug ? { ...lecture, isDeleted: false, lastAction: "edited" } : lecture,
        ),
      );
      setFormMessage("Lecture restored.");
      setFormError(null);
      await refreshPageData();
    } catch {
      setFormError("Could not restore lecture.");
    } finally {
      setMutatingLectureSlug(null);
    }
  };

  const handleRetryJob = async (targetJobId: string) => {
    try {
      setRetryingJobId(targetJobId);
      const result = await retryJob(targetJobId);
      setFormMessage(`${result.message}: ${targetJobId}`);
      setFormError(null);
      await refreshPageData();
    } catch {
      setFormError("Unable to retry job.");
    } finally {
      setRetryingJobId(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-blue-50 text-slate-900">
      <Navbar active="monitoring" />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600 px-6 py-6 shadow-lg">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
                  <Activity className="h-3 w-3 text-white" />
                </span>
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200">Admin Panel</p>
              </div>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">Job Monitoring</h1>
              <p className="mt-1 text-sm text-indigo-200">
                Track transcoding jobs, investigate failures, and keep lecture metadata aligned with pipeline output.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshPageData(true)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {backendWarning ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {backendWarning}
            </div>
          ) : null}

          <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                  <History className="h-4 w-4 text-indigo-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Job History</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Filter recent jobs by status, filename, or linked lecture.</p>
                </div>
              </div>
              <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                {filteredJobs.length} visible
              </span>
            </div>

            <div className="px-6 py-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200/70">
                  <History className="h-4 w-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Visible</p>
                  <p className="mt-0.5 text-2xl font-extrabold text-slate-800">{visibleJobStats.total}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                  <Activity className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Active</p>
                  <p className="mt-0.5 text-2xl font-extrabold text-blue-700">{visibleJobStats.active}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100">
                  <TriangleAlert className="h-4 w-4 text-rose-500" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400">Attention</p>
                  <p className="mt-0.5 text-2xl font-extrabold text-rose-700">{visibleJobStats.attention}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Avg Progress</p>
                  <p className="mt-0.5 text-2xl font-extrabold text-emerald-700">{visibleJobStats.avgProgress}%</p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={jobSearch}
                  onChange={(event) => setJobSearch(event.target.value)}
                  placeholder="Search by filename, job ID, or linked lecture"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {([
                  ["all", "All", jobCounts.all],
                  ["active", "Active", jobCounts.active],
                  ["completed", "Completed", jobCounts.completed],
                  ["failed", "Failed", jobCounts.failed],
                ] as const).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setJobFilter(value)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      jobFilter === value
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                    }`}
                  >
                    {label}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                        jobFilter === value ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {filteredJobs.length > 0 ? (
                filteredJobs.map((job) => {
                  const action = getJobAction(job, lectures);
                  const linkedLecture = getLinkedLecture(job, lectures);
                  const isActive = job.status === "queued" || job.status === "processing";
                  const statusStyles = {
                    queued: "bg-blue-100 text-blue-700",
                    processing: "bg-amber-100 text-amber-700",
                    completed: "bg-emerald-100 text-emerald-700",
                    failed: "bg-rose-100 text-rose-700",
                  }[job.status];
                  const progressBarColor = {
                    queued: "bg-blue-400",
                    processing: "bg-amber-500",
                    completed: "bg-emerald-500",
                    failed: "bg-rose-500",
                  }[job.status];


                  const accentColor = {
                    queued:     "border-l-blue-400",
                    processing: "border-l-amber-400",
                    completed:  "border-l-emerald-400",
                    failed:     "border-l-rose-400",
                  }[job.status];

                  const lectureLine =
                    linkedLecture
                      ? linkedLecture.title
                      : action === "Removed"
                        ? "Lecture record was permanently deleted"
                        : action === "Pending"
                          ? "Lecture will appear once processing completes"
                          : "No lecture linked yet";

                  const lectureLineColor =
                    !linkedLecture && action === "Removed"
                      ? "text-rose-400"
                      : !linkedLecture && action === "Pending"
                        ? "text-blue-400"
                        : "text-slate-400";

                  return (
                    <article key={job.id} className={`group rounded-xl border border-l-4 border-slate-100 bg-white px-5 py-4 shadow-sm transition-all hover:-translate-y-px hover:shadow-md ${accentColor}`}>
                      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,2.4fr)_0.9fr_1fr_0.9fr_auto] lg:items-center lg:gap-4">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            job.status === "queued"
                              ? "bg-blue-50"
                              : job.status === "processing"
                                ? "bg-amber-50"
                                : job.status === "completed"
                                  ? "bg-emerald-50"
                                  : "bg-rose-50"
                          }`}>
                            <Film className={`h-4 w-4 ${
                              job.status === "queued"
                                ? "text-blue-400"
                                : job.status === "processing"
                                  ? "text-amber-500"
                                  : job.status === "completed"
                                    ? "text-emerald-500"
                                    : "text-rose-400"
                            }`} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-800">{job.filename}</p>
                            <p className="mt-0.5 font-mono text-[10px] text-slate-300">{job.id}</p>
                            <p className={`mt-0.5 truncate text-xs ${lectureLineColor}`}>
                              {linkedLecture && (
                                <span className="mr-1 text-slate-400">↳</span>
                              )}
                              {lectureLine}
                            </p>
                          </div>
                        </div>

                        <div>
                          <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles}`}>
                            {job.status}
                          </span>
                        </div>

                        <div>
                          <p className={`text-xs font-bold ${isActive ? "text-indigo-600" : "text-slate-500"}`}>
                            {job.progress}%
                          </p>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                            {job.status === "queued" ? (
                              <div className="h-full w-full animate-pulse rounded-full bg-blue-200" />
                            ) : (
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${progressBarColor}${
                                  job.status === "processing" ? " animate-pulse" : ""
                                }`}
                                style={{ width: `${job.progress}%` }}
                              />
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500" title={new Date(job.updatedAt).toLocaleString()}>
                            <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                            {formatRelativeTime(job.updatedAt)}
                          </div>
                        </div>

                        <div className="flex flex-row items-center gap-2 lg:flex-col lg:items-end">
                          {job.status === "failed" ? (
                            <button
                              type="button"
                              onClick={() => void handleRetryJob(job.id)}
                              disabled={retryingJobId === job.id}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <RotateCcw className="h-3 w-3" />
                              {retryingJobId === job.id ? "Retrying…" : "Retry"}
                            </button>
                          ) : null}
                          {getActionBadge(action)}
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200/70">
                    <Film className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-600">
                    {jobSearch || jobFilter !== "all" ? "No jobs found" : "No jobs yet"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {jobSearch || jobFilter !== "all" ? "Try adjusting your search or filter." : "Jobs will appear here after uploads."}
                  </p>
                </div>
              )}
            </div>
            </div>
          </section>

          <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                  <BookOpen className="h-4 w-4 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Manage Lectures</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Review the catalog state that each pipeline job feeds into.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {lectures.length - deletedLectureCount} active
                </span>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                  {deletedLectureCount} deleted
                </span>
                <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                  {filteredLectures.length} shown
                </span>
              </div>
            </div>

            <div className="px-6 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={lectureSearch}
                  onChange={(event) => setLectureSearch(event.target.value)}
                  placeholder="Search by title, description, or slug"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {([
                  ["all", "All lectures"],
                  ["active", "Active only"],
                  ["deleted", "Deleted only"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLectureFilter(value)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      lectureFilter === value
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {selectedLectureSlug ? (
              <div className="mt-4 grid gap-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 md:grid-cols-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-300"
                  placeholder="Lecture title"
                />
                <input
                  type="text"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-300"
                  placeholder="Lecture description"
                />
                <div className="flex gap-2 md:col-span-2">
                  <button
                    type="button"
                    onClick={() => void handleUpdateLecture()}
                    disabled={mutatingLectureSlug === selectedLectureSlug}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {mutatingLectureSlug === selectedLectureSlug ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLectureSlug(null)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              {filteredLectures.length > 0 ? (
                filteredLectures.map((lecture) => {
                  const isDeleted = Boolean(lecture.isDeleted);
                  const isMutating = mutatingLectureSlug === lecture.slug;

                  return (
                    <div
                      key={lecture.slug}
                      className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3 transition ${
                        isDeleted
                          ? "border-slate-100 bg-slate-50/60 opacity-75"
                          : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          isDeleted ? "bg-slate-100" : "bg-indigo-50"
                        }`}>
                          <Film className={`h-4 w-4 ${isDeleted ? "text-slate-400" : "text-indigo-400"}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                isDeleted ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-600"
                              }`}
                            >
                              {isDeleted ? "Deleted" : "Active"}
                            </span>
                            <p className={`text-sm font-semibold ${isDeleted ? "text-slate-400 line-through decoration-slate-300" : "text-slate-800"}`}>
                              {lecture.title}
                            </p>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-400">{lecture.description}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-slate-300">{lecture.slug}</p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {isDeleted ? (
                          <button
                            type="button"
                            onClick={() => void handleRestoreLecture(lecture.slug)}
                            disabled={isMutating}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            {isMutating ? "Restoring..." : "Restore"}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditLecture(lecture)}
                              disabled={isMutating}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteLecture(lecture.slug)}
                              disabled={isMutating}
                              className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {isMutating ? "Deleting..." : "Delete"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200/70">
                    <BookOpen className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-600">
                    {lectureSearch || lectureFilter !== "all" ? "No lectures found" : "No lectures yet"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {lectureSearch || lectureFilter !== "all" ? "Try adjusting your search or filter." : "Lectures will appear here after processing."}
                  </p>
                </div>
              )}
            </div>

            {formError ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                <p className="text-xs font-medium text-rose-700">{formError}</p>
              </div>
            ) : null}
            {formMessage ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">✓</span>
                <p className="text-xs font-medium text-emerald-700">{formMessage}</p>
              </div>
            ) : null}
            </div>
          </section>
        </section>
      </main>

      <Footer />
    </div>
  );
}
