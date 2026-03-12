import { apiBaseUrl, fetchJson } from "./api";

export type AdminJob = {
  id: string;
  filename: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  updatedAt: string;
};

export type DashboardSummary = {
  totalLectures: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  recentJobs: AdminJob[];
};

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  return await fetchJson<DashboardSummary>(`${apiBaseUrl}/api/admin/dashboard-summary`);
}

export async function retryJob(jobId: string): Promise<{ message: string; job_id: string }> {
  return await fetchJson<{ message: string; job_id: string }>(`${apiBaseUrl}/api/jobs/${jobId}/retry`, {
    method: "POST",
  });
}
