"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  CloudUpload,
  HeartPulse,
  RefreshCcw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import Footer from "../../../components/Footer";
import Navbar from "../../../components/Navbar";
import { retryJob, fetchDashboardSummary, type DashboardSummary } from "../../../lib/admin";
import { apiBaseUrl } from "../../../lib/api";
import { deleteLecture, fetchLectures, type Lecture, updateLecture } from "../../student/lectures";

type StatCard = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  subtext: string;
  iconColor: string;
};

type UploadResponse = {
  job_id: string;
  message: string;
};

type JobStatus = {
  id: string;
  filename: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  formats: string[];
};

function formatUpdatedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }
  return parsed.toLocaleString();
}

export default function AdminDashboardPage() {
  const [lectureTitle, setLectureTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [activeJobIds, setActiveJobIds] = useState<Set<string>>(new Set());
  const [jobStatuses, setJobStatuses] = useState<Map<string, JobStatus>>(new Map());
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingSummary, setIsRefreshingSummary] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [backendWarning, setBackendWarning] = useState<string | null>(null);

  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [selectedLectureSlug, setSelectedLectureSlug] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const computedStats = useMemo<StatCard[]>(() => {
    return [
      {
        icon: Clock3,
        title: "Active Transcoding",
        value: String(dashboardSummary?.activeJobs ?? 0),
        subtext: "Queued + processing jobs",
        iconColor: "text-blue-500",
      },
      {
        icon: CheckCircle2,
        title: "Completed Jobs",
        value: String(dashboardSummary?.completedJobs ?? 0),
        subtext: "Successfully processed videos",
        iconColor: "text-emerald-500",
      },
      {
        icon: ShieldAlert,
        title: "Failed Jobs",
        value: String(dashboardSummary?.failedJobs ?? 0),
        subtext: "Needs retry or investigation",
        iconColor: "text-rose-500",
      },
      {
        icon: BarChart3,
        title: "Total Lectures",
        value: String(dashboardSummary?.totalLectures ?? lectures.length),
        subtext: "Published content",
        iconColor: "text-indigo-500",
      },
    ];
  }, [dashboardSummary, lectures.length]);

  const loadDashboardSummary = async (withSpinner = false) => {
    try {
      if (withSpinner) {
        setIsRefreshingSummary(true);
      }
      const payload = await fetchDashboardSummary();
      setDashboardSummary(payload);
      setBackendWarning(null);

      // Track active jobs from dashboard summary
      const activeIds = new Set<string>();
      for (const job of payload.recentJobs) {
        if (job.status === "queued" || job.status === "processing") {
          activeIds.add(job.id);
        }
      }
      setActiveJobIds(activeIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load dashboard summary";
      setBackendWarning(message);
    } finally {
      if (withSpinner) {
        setIsRefreshingSummary(false);
      }
    }
  };

  const loadLectures = async () => {
    try {
      const payload = await fetchLectures();
      setLectures(payload);
      setBackendWarning(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load lectures";
      setBackendWarning(message);
      setLectures([]);
    }
  };

  useEffect(() => {
    void loadDashboardSummary();
    void loadLectures();
  }, []);

  useEffect(() => {
    const summaryPoller = setInterval(() => {
      void loadDashboardSummary();
    }, 10000);

    return () => {
      clearInterval(summaryPoller);
    };
  }, []);

  useEffect(() => {
    if (activeJobIds.size === 0) {
      return;
    }

    const fetchJobStatuses = async () => {
      const newStatuses = new Map<string, JobStatus>();
      
      for (const jobId of activeJobIds) {
        try {
          const response = await fetch(`${apiBaseUrl}/api/status/${jobId}`, { cache: "no-store" });
          if (response.ok) {
            const payload: JobStatus = await response.json();
            newStatuses.set(jobId, payload);
          }
        } catch {
          // Silently skip failed requests
        }
      }

      setJobStatuses(newStatuses);

      // Check if any jobs are now completed/failed
      let needsRefresh = false;
      for (const [jobId, status] of newStatuses) {
        if (status.status === "completed" || status.status === "failed") {
          needsRefresh = true;
        }
      }

      if (needsRefresh) {
        await Promise.all([loadLectures(), loadDashboardSummary()]);
      }
    };

    void fetchJobStatuses();
    const poller = setInterval(() => {
      void fetchJobStatuses();
    }, 3000);

    return () => {
      clearInterval(poller);
    };
  }, [activeJobIds]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFormError(null);
    setFormMessage(null);
    const file = event.target.files?.[0] ?? null;

    if (file && !file.type.startsWith("video/")) {
      setSelectedFile(null);
      setFormError("Please choose a valid video file.");
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFormMessage(null);

    if (!selectedFile) {
      setFormError("Please select a video file before starting the pipeline.");
      return;
    }

    if (!lectureTitle.trim()) {
      setFormError("Please enter a lecture title.");
      return;
    }

    if (!description.trim()) {
      setFormError("Please enter a lecture description.");
      return;
    }

    try {
      setIsSubmitting(true);
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("title", lectureTitle.trim());
      formData.append("description", description.trim());

      const response = await fetch(`${apiBaseUrl}/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errorData.detail ?? "Upload failed");
      }

      const payload: UploadResponse = await response.json();
      setActiveJobIds((prev) => new Set([...prev, payload.job_id]));
      setFormMessage(`Upload accepted. Tracking job ${payload.job_id}.`);
      setLectureTitle("");
      setDescription("");
      setSelectedFile(null);
      await loadDashboardSummary();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditLecture = (lecture: Lecture) => {
    setSelectedLectureSlug(lecture.slug);
    setEditTitle(lecture.title);
    setEditDescription(lecture.description);
  };

  const handleUpdateLecture = async () => {
    if (!selectedLectureSlug) {
      return;
    }

    try {
      await updateLecture(selectedLectureSlug, {
        title: editTitle.trim(),
        description: editDescription.trim(),
      });

      setLectures((current) =>
        current.map((lecture) =>
          lecture.slug === selectedLectureSlug
            ? { ...lecture, title: editTitle.trim(), description: editDescription.trim() }
            : lecture,
        ),
      );
      setSelectedLectureSlug(null);
      setEditTitle("");
      setEditDescription("");
      setFormMessage("Lecture updated successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update lecture details.";
      setFormError(message);
    }
  };

  const handleDeleteLecture = async (slug: string) => {
    try {
      await deleteLecture(slug);
      setLectures((current) => current.filter((lecture) => lecture.slug !== slug));
      if (selectedLectureSlug === slug) {
        setSelectedLectureSlug(null);
        setEditTitle("");
        setEditDescription("");
      }
      setFormMessage("Lecture deleted.");
      await loadDashboardSummary();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete lecture.";
      setFormError(message);
    }
  };

  const handleRetryJob = async (targetJobId: string) => {
    try {
      setRetryingJobId(targetJobId);
      const result = await retryJob(targetJobId);
      setFormMessage(`${result.message}: ${targetJobId}`);
      setActiveJobIds((prev) => new Set([...prev, targetJobId]));
      await loadDashboardSummary();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to retry job";
      setFormError(message);
    } finally {
      setRetryingJobId(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
      <Navbar active="admin" />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-4xl px-4 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-4xl font-bold text-slate-900">Admin Dashboard</h1>
              <p className="mt-1 text-lg text-slate-500">
                Monitor your video pipeline and manage lecture content.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadDashboardSummary(true)}
              disabled={isRefreshingSummary}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${isRefreshingSummary ? "animate-spin" : ""}`} />
              Refresh Metrics
            </button>
          </div>

          {backendWarning ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {backendWarning}
            </div>
          ) : null}

          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {computedStats.map((stat) => {
              const Icon = stat.icon;

              return (
                <article key={stat.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 ${stat.iconColor}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-slate-500">
                      LIVE
                    </span>
                  </div>
                  <p className="mt-5 text-sm font-medium text-slate-500">{stat.title}</p>
                  <p className="mt-1 text-4xl font-bold leading-none text-slate-900">{stat.value}</p>
                  <p className="mt-3 text-xs text-slate-500">{stat.subtext}</p>
                </article>
              );
            })}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-3xl font-bold text-slate-900">Upload Lecture Video</h2>
              <p className="mt-1 text-lg text-slate-500">Add new content to the learning platform.</p>

              <form className="mt-5 space-y-4" onSubmit={handleUpload}>
                <div>
                  <label htmlFor="lecture-title" className="text-xs font-semibold text-slate-700">Lecture Title</label>
                  <input
                    id="lecture-title"
                    type="text"
                    placeholder="e.g. Distributed Systems 101"
                    value={lectureTitle}
                    onChange={(event) => setLectureTitle(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-300"
                  />
                </div>

                <div>
                  <label htmlFor="description" className="text-xs font-semibold text-slate-700">Description</label>
                  <textarea
                    id="description"
                    rows={4}
                    placeholder="Provide a brief summary of the lecture..."
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-300"
                  />
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-700">Video File</p>
                  <label className="mt-1 flex cursor-pointer flex-col items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center hover:bg-slate-100">
                    <CloudUpload className="h-5 w-5 text-slate-500" />
                    <span className="mt-2 text-sm font-semibold text-slate-700">Click to upload or drag and drop</span>
                    <span className="mt-1 text-xs text-slate-400">MP4, MOV up to 1GB</span>
                    <input type="file" accept="video/*" className="sr-only" onChange={handleFileChange} />
                  </label>
                  {selectedFile ? <p className="mt-2 text-xs text-slate-500">Selected: {selectedFile.name}</p> : null}
                </div>

                {formError ? (
                  <p className="inline-flex items-center gap-1 text-xs text-rose-600">
                    <TriangleAlert className="h-3.5 w-3.5" />
                    {formError}
                  </p>
                ) : null}
                {formMessage ? <p className="text-xs text-emerald-600">{formMessage}</p> : null}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? "Starting..." : "Start Transcoding Pipeline"}
                </button>
              </form>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900">Live Job Pipeline</h2>
                  <p className="mt-1 text-lg text-slate-500">Real-time status of video processing tasks.</p>
                </div>
                {jobStatuses.size > 0 ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-600"></span>
                    </span>
                    {jobStatuses.size} Active
                  </span>
                ) : null}
              </div>

              {jobStatuses.size > 0 ? (
                <div className="mt-6 space-y-3">
                  {Array.from(jobStatuses.values()).map((job) => {
                    const isActive = job.status === "queued" || job.status === "processing";
                    const statusColor = {
                      queued: "bg-blue-100 text-blue-700",
                      processing: "bg-amber-100 text-amber-700",
                      completed: "bg-emerald-100 text-emerald-700",
                      failed: "bg-rose-100 text-rose-700",
                    }[job.status] || "bg-slate-100 text-slate-700";

                    return (
                      <div key={job.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{job.filename}</p>
                            <p className="text-xs text-slate-500">Job ID: {job.id}</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusColor}`}>
                            {job.status}
                          </span>
                        </div>

                        {isActive ? (
                          <>
                            <div className="mt-4">
                              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                                <span>Progress</span>
                                <span>{job.progress}%</span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className="h-full bg-indigo-600 transition-all duration-500"
                                  style={{ width: `${job.progress}%` }}
                                />
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              {job.formats.map((format) => (
                                <span
                                  key={format}
                                  className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600"
                                >
                                  {format}
                                </span>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-[390px] flex-col items-center justify-center text-center text-slate-400">
                  <HeartPulse className="h-10 w-10" />
                  <p className="mt-3 text-lg text-slate-500">No active jobs in the queue.</p>
                  <p className="mt-1 text-sm text-slate-400">Upload a video to start transcoding.</p>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Job History</h2>
                  <p className="mt-1 text-sm text-slate-500">Complete list of all transcoding jobs</p>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                <div className="grid grid-cols-12 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <span className="col-span-4">File</span>
                  <span className="col-span-2">Status</span>
                  <span className="col-span-2">Progress</span>
                  <span className="col-span-3">Updated</span>
                  <span className="col-span-1 text-right">Action</span>
                </div>

                <div className="divide-y divide-slate-200">
                  {(dashboardSummary?.recentJobs ?? []).length > 0 ? (
                    dashboardSummary?.recentJobs.map((job) => {
                      const statusColor = {
                        queued: "text-blue-600 bg-blue-50",
                        processing: "text-amber-600 bg-amber-50",
                        completed: "text-emerald-600 bg-emerald-50",
                        failed: "text-rose-600 bg-rose-50",
                      }[job.status] || "text-slate-600 bg-slate-50";

                      return (
                        <div key={job.id} className="grid grid-cols-12 items-center px-3 py-2 text-xs text-slate-700">
                          <span className="col-span-4 truncate pr-2 font-medium">{job.filename}</span>
                          <span className={`col-span-2 inline-flex items-center gap-1`}>
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusColor.replace('text-', 'bg-').replace('bg-bg-', 'bg-')}`}></span>
                            <span className="capitalize">{job.status}</span>
                          </span>
                          <span className="col-span-2">
                            {job.status === "queued" || job.status === "processing" ? (
                              <span className="font-semibold text-indigo-600">{job.progress}%</span>
                            ) : (
                              <span>{job.progress}%</span>
                            )}
                          </span>
                          <span className="col-span-3 text-slate-500">{formatUpdatedAt(job.updatedAt)}</span>
                          <div className="col-span-1 flex justify-end">
                            {job.status === "failed" ? (
                              <button
                                type="button"
                                onClick={() => void handleRetryJob(job.id)}
                                disabled={retryingJobId === job.id}
                                className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                {retryingJobId === job.id ? "..." : "Retry"}
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400">—</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="px-4 py-6 text-center text-sm text-slate-500">No jobs available yet.</div>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
              <h2 className="text-2xl font-bold text-slate-900">Manage Lectures</h2>
              <p className="mt-1 text-sm text-slate-500">Edit or delete published lecture metadata.</p>

              {selectedLectureSlug ? (
                <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                    placeholder="Lecture title"
                  />
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                    placeholder="Lecture description"
                  />
                  <div className="md:col-span-2 flex gap-2">
                    <button
                      type="button"
                      onClick={handleUpdateLecture}
                      className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
                    >
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedLectureSlug(null)}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                {lectures.length > 0 ? (
                  lectures.map((lecture) => (
                    <div key={lecture.slug} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{lecture.title}</p>
                        <p className="text-xs text-slate-500">{lecture.description}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEditLecture(lecture)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteLecture(lecture.slug)}
                          className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    No lectures available yet.
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
