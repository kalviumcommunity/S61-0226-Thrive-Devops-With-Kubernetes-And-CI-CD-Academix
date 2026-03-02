"use client";

// Helper to determine action for a job row (DB-driven)
function getAction(job: any, lectures: Lecture[]) {
  const lecture = lectures.find(
    (l) => l.source_job_id === job.id || l.videoUrl?.includes(job.id)
  );
  if (!lecture) return "Orphan";
  if (lecture.isDeleted) return "Deleted";
  if (lecture.lastAction === "edited") return "Edited";
  if (
    lecture.updatedAt &&
    lecture.createdAt &&
    lecture.updatedAt !== lecture.createdAt
  ) {
    return "Updated";
  }
  return "Linked";
}

// Helper to render color badge for action
function getActionBadge(action: string) {
  switch (action) {
    case "Updated":
      return <span className="text-green-600 font-semibold">🟢 Updated</span>;
    case "Edited":
      return <span className="text-yellow-600 font-semibold">🟡 Edited</span>;
    case "Deleted":
      return <span className="text-red-600 font-semibold">🔴 Deleted</span>;
    case "Linked":
      return <span className="text-purple-600 font-semibold">🟣 Linked</span>;
    case "Orphan":
      return <span className="text-slate-400 font-semibold">⚪ Orphan</span>;
    default:
      return <span>{action}</span>;
  }
}

import React, { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import Navbar from "../../../components/Navbar";
import Footer from "../../../components/Footer";
import { retryJob, fetchDashboardSummary, type DashboardSummary } from "../../../lib/admin";
import { apiBaseUrl } from "../../../lib/api";
import { deleteLecture, fetchLectures, type Lecture, updateLecture } from "../../student/lectures";

function formatUpdatedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }
  return parsed.toLocaleString();
}

const JobMonitoringPage = () => {
    // Debug state for UI
    const [showDebug, setShowDebug] = useState(false);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [selectedLectureSlug, setSelectedLectureSlug] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  // Debug: Log lectures on change
  useEffect(() => {
    console.log("[DEBUG] lectures:", lectures);
  }, [lectures]);

  useEffect(() => {
    void loadDashboardSummary();
    void loadLectures();
  }, []);

  const loadDashboardSummary = async () => {
    try {
      const payload = await fetchDashboardSummary();
      setDashboardSummary(payload);
    } catch (error) {
      setDashboardSummary(null);
    }
  };

  const loadLectures = async () => {
    try {
      const payload = await fetchLectures();
      setLectures(payload);
    } catch (error) {
      setLectures([]);
    }
  };

  const startEditLecture = (lecture: Lecture) => {
    setSelectedLectureSlug(lecture.slug);
    setEditTitle(lecture.title);
    setEditDescription(lecture.description);
  };

  const handleUpdateLecture = async () => {
    if (!selectedLectureSlug) return;
    try {
      await updateLecture(selectedLectureSlug, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        lastAction: "edited"
      });
      setLectures((current) =>
        current.map((lecture) =>
          lecture.slug === selectedLectureSlug
            ? { ...lecture, title: editTitle.trim(), description: editDescription.trim(), lastAction: "edited" }
            : lecture,
        ),
      );
      setSelectedLectureSlug(null);
      setEditTitle("");
      setEditDescription("");
      setFormMessage("Lecture updated successfully.");
    } catch (error) {
      setFormError("Could not update lecture details.");
    }
  };

  const handleDeleteLecture = async (slug: string) => {
    try {
      // Find the lecture before deleting
      const lecture = lectures.find(l => l.slug === slug);
      // Soft delete: update isDeleted and lastAction
      if (lecture) {
        await updateLecture(slug, { isDeleted: true, lastAction: "deleted" });
        setLectures((current) =>
          current.map((l) =>
            l.slug === slug ? { ...l, isDeleted: true, lastAction: "deleted" } : l
          )
        );
      }
      if (selectedLectureSlug === slug) {
        setSelectedLectureSlug(null);
        setEditTitle("");
        setEditDescription("");
      }
      setFormMessage("Lecture deleted.");
      await loadDashboardSummary();
    } catch (error) {
      setFormError("Could not delete lecture.");
    }
  };

  const handleRetryJob = async (targetJobId: string) => {
    try {
      setRetryingJobId(targetJobId);
      const result = await retryJob(targetJobId);
      setFormMessage(`${result.message}: ${targetJobId}`);
      await loadDashboardSummary();
    } catch (error) {
      setFormError("Unable to retry job");
    } finally {
      setRetryingJobId(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
      <Navbar active="monitoring" />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-4xl px-4 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <h1 className="text-4xl font-bold text-slate-900">Job Monitoring</h1>
              <p className="mt-1 text-lg text-slate-500">
                Monitor all transcoding jobs and manage lecture content.
              </p>
            </div>
          </div>
          {/* Job History Section */}
          <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
                            <span className="text-[11px]">{getActionBadge(getAction(job, lectures))}</span>
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
            {formError ? (
              <p className="inline-flex items-center gap-1 text-xs text-rose-600 mt-2">
                <TriangleAlert className="h-3.5 w-3.5" />
                {formError}
              </p>
            ) : null}
            {formMessage ? <p className="text-xs text-emerald-600 mt-2">{formMessage}</p> : null}
          </section>
          {/* Manage Lectures Section */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
            {formError ? (
              <p className="inline-flex items-center gap-1 text-xs text-rose-600 mt-2">
                <TriangleAlert className="h-3.5 w-3.5" />
                {formError}
              </p>
            ) : null}
            {formMessage ? <p className="text-xs text-emerald-600 mt-2">{formMessage}</p> : null}
          </section>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default JobMonitoringPage;
