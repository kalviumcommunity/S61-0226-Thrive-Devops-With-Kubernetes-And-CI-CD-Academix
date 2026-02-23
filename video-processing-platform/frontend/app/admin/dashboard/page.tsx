"use client";

export const dynamic = "force-dynamic";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  CloudUpload,
  HeartPulse,
  Plus,
  ShieldAlert,
} from "lucide-react";
import Navbar from "../../../components/Navbar";

type StatCard = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  subtext: string;
  iconColor: string;
};

const stats: StatCard[] = [
  {
    icon: Clock3,
    title: "Active Transcoding",
    value: "0",
    subtext: "Currently processing",
    iconColor: "text-blue-500",
  },
  {
    icon: CheckCircle2,
    title: "Completed Today",
    value: "0",
    subtext: "+12% from yesterday",
    iconColor: "text-emerald-500",
  },
  {
    icon: ShieldAlert,
    title: "Failed Jobs",
    value: "0",
    subtext: "3 auto-retried",
    iconColor: "text-rose-500",
  },
  {
    icon: BarChart3,
    title: "Total Storage",
    value: "1.2 TB",
    subtext: "82% capacity",
    iconColor: "text-indigo-500",
  },
];

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

type Lecture = {
  slug: string;
  title: string;
  description: string;
};

export default function AdminDashboardPage() {
  const [lectureTitle, setLectureTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [selectedLectureSlug, setSelectedLectureSlug] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  const computedStats = useMemo(() => {
    if (!jobStatus) {
      return stats;
    }

    const hasCompleted = jobStatus.status === "completed";
    const hasFailed = jobStatus.status === "failed";
    const isActive = jobStatus.status === "queued" || jobStatus.status === "processing";

    return stats.map((item) => {
      if (item.title === "Active Transcoding") {
        return {
          ...item,
          value: isActive ? "1" : "0",
          subtext: isActive ? `Job ${jobStatus.id} running` : "Currently processing",
        };
      }

      if (item.title === "Completed Today") {
        return {
          ...item,
          value: hasCompleted ? "1" : "0",
          subtext: hasCompleted ? `${jobStatus.filename} finished` : "+12% from yesterday",
        };
      }

      if (item.title === "Failed Jobs") {
        return {
          ...item,
          value: hasFailed ? "1" : "0",
          subtext: hasFailed ? `${jobStatus.filename} failed` : "3 auto-retried",
        };
      }

      return item;
    });
  }, [jobStatus]);

  useEffect(() => {
    if (!jobId) {
      return;
    }

    let shouldStop = false;

    const fetchStatus = async () => {
      if (shouldStop) {
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/api/status/${jobId}`);

        if (!response.ok) {
          throw new Error("Unable to fetch job status");
        }

        const payload: JobStatus = await response.json();
        setJobStatus(payload);

        if (payload.status === "completed" || payload.status === "failed") {
          shouldStop = true;
        }
      } catch {
        setFormError("Could not refresh job status. Please check backend service.");
      }
    };

    fetchStatus();
    const poller = setInterval(fetchStatus, 3000);

    return () => {
      shouldStop = true;
      clearInterval(poller);
    };
  }, [apiBaseUrl, jobId]);

  useEffect(() => {
    const loadLectures = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/lectures`);
        if (!response.ok) {
          throw new Error("Unable to load lectures");
        }

        const payload = (await response.json()) as Lecture[];
        setLectures(payload);
      } catch {
        setLectures([]);
      }
    };

    loadLectures();
  }, [apiBaseUrl, jobStatus?.status]);

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
      setJobId(payload.job_id);

      try {
        const lecturePayload = {
          slug: payload.job_id,
          title: lectureTitle || selectedFile.name || payload.job_id,
          description:
            description || "Transcoded lecture generated from uploaded video.",
          duration: "10:00",
          image:
            "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1200&q=80",
          publishedDate: new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "2-digit",
          }),
          views: "0 views",
          aiSummary:
            "Summary will be generated after initial student engagement.",
          keyConcepts: [] as Array<{ title: string; timestamp: string }>,
        };

        const lectureResponse = await fetch(`${apiBaseUrl}/api/lectures`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(lecturePayload),
        });

        if (!lectureResponse.ok) {
          const lectureError = (await lectureResponse
            .json()
            .catch(() => ({}))) as { detail?: string };
          throw new Error(
            lectureError.detail ??
              "Video uploaded but lecture metadata could not be saved.",
          );
        }

        setFormMessage(
          `Upload accepted and lecture created. Tracking job ${payload.job_id}.`,
        );
        setLectureTitle("");
        setDescription("");
        setSelectedFile(null);
      } catch (lectureError) {
        const message =
          lectureError instanceof Error
            ? lectureError.message
            : "Video uploaded but lecture metadata could not be saved.";
        setFormError(message);
      }
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
      const response = await fetch(`${apiBaseUrl}/api/lectures/${selectedLectureSlug}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to update lecture");
      }

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
    } catch {
      setFormError("Could not update lecture details.");
    }
  };

  const handleDeleteLecture = async (slug: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/lectures/${slug}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Unable to delete lecture");
      }

      setLectures((current) => current.filter((lecture) => lecture.slug !== slug));
      if (selectedLectureSlug === slug) {
        setSelectedLectureSlug(null);
        setEditTitle("");
        setEditDescription("");
      }
    } catch {
      setFormError("Could not delete lecture.");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
      <Navbar active="admin" />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-6 py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold text-slate-900">Admin Dashboard</h1>
              <p className="mt-1 text-lg text-slate-500">
                Monitor your video pipeline and manage lecture content.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Activity className="h-4 w-4" />
                System Status
              </button>
              <button className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800">
                <Plus className="h-4 w-4" />
                New Course
              </button>
            </div>
          </div>

          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {computedStats.map((stat) => {
              const Icon = stat.icon;

              return (
                <article
                  key={stat.title}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 ${stat.iconColor}`}
                    >
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
              <p className="mt-1 text-lg text-slate-500">
                Add new content to the learning platform.
              </p>

              <form className="mt-5 space-y-4" onSubmit={handleUpload}>
                <div>
                  <label htmlFor="lecture-title" className="text-xs font-semibold text-slate-700">
                    Lecture Title
                  </label>
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
                  <label htmlFor="description" className="text-xs font-semibold text-slate-700">
                    Description
                  </label>
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
                    <span className="mt-2 text-sm font-semibold text-slate-700">
                      Click to upload or drag and drop
                    </span>
                    <span className="mt-1 text-xs text-slate-400">MP4, MOV up to 2GB</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="sr-only"
                      onChange={handleFileChange}
                    />
                  </label>
                  {selectedFile ? (
                    <p className="mt-2 text-xs text-slate-500">Selected: {selectedFile.name}</p>
                  ) : null}
                </div>

                {formError ? <p className="text-xs text-rose-600">{formError}</p> : null}
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
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900">Live Job Pipeline</h2>
                  <p className="mt-1 text-lg text-slate-500">
                    Real-time status of video processing tasks.
                  </p>
                </div>
                <button className="text-sm font-semibold text-slate-700 hover:text-indigo-700">
                  View All
                </button>
              </div>

              {jobStatus ? (
                <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{jobStatus.filename}</p>
                      <p className="text-xs text-slate-500">Job ID: {jobStatus.id}</p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
                      {jobStatus.status}
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                      <span>Progress</span>
                      <span>{jobStatus.progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full bg-indigo-600 transition-all duration-500"
                        style={{ width: `${jobStatus.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {jobStatus.formats.map((format) => (
                      <span
                        key={format}
                        className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600"
                      >
                        {format}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex h-[390px] flex-col items-center justify-center text-center text-slate-400">
                  <HeartPulse className="h-10 w-10" />
                  <p className="mt-3 text-lg text-slate-500">No active jobs in the queue.</p>
                </div>
              )}
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
                    <div
                      key={lecture.slug}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                    >
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
                          onClick={() => handleDeleteLecture(lecture.slug)}
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

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-400">
        © 2026 Academix Learning Platform. Built for the future of education.
      </footer>
    </div>
  );
}
