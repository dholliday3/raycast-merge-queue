import { gh, RepoConfig, repoSlug, rest } from "./gh";
import { CheckState } from "./queue";

export type JobStep = {
  number: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt?: string;
  completedAt?: string;
};

export type Job = {
  id: number;
  runId: number;
  runAttempt: number;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  runUrl: string;
  startedAt?: string;
  completedAt?: string;
  workflowName?: string;
  runnerName?: string;
  steps: JobStep[];
};

export type Annotation = {
  level: string;
  title?: string;
  message: string;
  path: string;
  line?: number;
};

type RawJob = {
  id: number;
  run_id: number;
  run_attempt: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  run_url: string;
  started_at: string | null;
  completed_at: string | null;
  workflow_name?: string;
  runner_name?: string | null;
  steps?: {
    number: number;
    name: string;
    status: string;
    conclusion: string | null;
    started_at: string | null;
    completed_at: string | null;
  }[];
};

type RawAnnotation = {
  path: string;
  start_line: number | null;
  annotation_level: string;
  title: string | null;
  message: string;
};

export async function fetchJob(config: RepoConfig, jobId: number): Promise<Job> {
  const raw = await rest<RawJob>(config, `repos/${repoSlug(config)}/actions/jobs/${jobId}`);
  return {
    id: raw.id,
    runId: raw.run_id,
    runAttempt: raw.run_attempt,
    name: raw.name,
    status: raw.status,
    conclusion: raw.conclusion,
    htmlUrl: raw.html_url,
    runUrl: `https://github.com/${repoSlug(config)}/actions/runs/${raw.run_id}`,
    startedAt: raw.started_at ?? undefined,
    completedAt: raw.completed_at ?? undefined,
    workflowName: raw.workflow_name,
    runnerName: raw.runner_name ?? undefined,
    steps: (raw.steps ?? []).map((step) => ({
      number: step.number,
      name: step.name,
      status: step.status,
      conclusion: step.conclusion,
      startedAt: step.started_at ?? undefined,
      completedAt: step.completed_at ?? undefined,
    })),
  };
}

export async function fetchAnnotations(config: RepoConfig, jobId: number): Promise<Annotation[]> {
  const raw = await rest<RawAnnotation[]>(
    config,
    `repos/${repoSlug(config)}/check-runs/${jobId}/annotations?per_page=50`,
  );
  return raw.map((annotation) => ({
    level: annotation.annotation_level,
    title: annotation.title || undefined,
    message: annotation.message,
    path: annotation.path,
    line: annotation.start_line ?? undefined,
  }));
}

export function fetchJobLog(config: RepoConfig, jobId: number): Promise<string> {
  return gh(config, ["api", "--allow-escape-sequences", `repos/${repoSlug(config)}/actions/jobs/${jobId}/logs`]);
}

export async function rerunFailedJobs(config: RepoConfig, runId: number): Promise<void> {
  await gh(config, ["run", "rerun", String(runId), "--failed", "-R", repoSlug(config)]);
}

export async function rerunJob(config: RepoConfig, jobId: number): Promise<void> {
  await gh(config, ["run", "rerun", "--job", String(jobId), "-R", repoSlug(config)]);
}

const FAILED_JOB_CONCLUSIONS = new Set(["failure", "timed_out", "cancelled", "startup_failure", "action_required"]);

export function jobState(job: Job): CheckState {
  if (job.status !== "completed") {
    return "pending";
  }
  if (job.conclusion === "success") {
    return "success";
  }
  if (job.conclusion === "skipped") {
    return "skipped";
  }
  return job.conclusion && FAILED_JOB_CONCLUSIONS.has(job.conclusion) ? "failure" : "neutral";
}
