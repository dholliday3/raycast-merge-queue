import { Cache, getPreferenceValues } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { DEMO_ANNOTATIONS, DEMO_LOG, DEMO_REPO, DEMO_REQUIRED_CHECKS, demoJob, demoQueue } from "./lib/demo";
import { findGh, parseRepository, RepoConfig, repoSlug } from "./lib/gh";
import { Annotation, fetchAnnotations, fetchJob, fetchJobLog, rerunFailedJobs, rerunJob } from "./lib/jobs";
import { summarizeLog } from "./lib/logs";
import { fetchQueue, fetchRequiredChecks, parseQueue, QueueSnapshot } from "./lib/queue";

export type MergeQueueLaunchContext = { prNumber?: number; view?: "checks"; demo?: boolean };

type CachedRequiredChecks = { fetchedAt: number; checks: string[] };

const REQUIRED_CHECKS_TTL_MS = 60 * 60 * 1000;
const cache = new Cache();

let demo = false;

export function enableDemo(enabled: boolean | undefined) {
  demo = demo || Boolean(enabled);
}

export function isDemo(): boolean {
  return demo;
}

export function getConfig(): RepoConfig {
  const preferences = getPreferenceValues<Preferences>();
  const preferredGh = preferences.ghPath?.trim() || undefined;
  return {
    ...parseRepository(preferences.repository ?? ""),
    branch: preferences.branch?.trim() || undefined,
    ghPath: findGh(preferredGh) ?? preferredGh ?? "/opt/homebrew/bin/gh",
  };
}

async function requiredChecks(config: RepoConfig, branch: string): Promise<string[]> {
  const key = `required-checks:${repoSlug(config)}:${branch}`;
  const raw = cache.get(key);
  const cached = raw ? (JSON.parse(raw) as CachedRequiredChecks) : undefined;
  if (cached && Date.now() - cached.fetchedAt < REQUIRED_CHECKS_TTL_MS) {
    return cached.checks;
  }
  try {
    const checks = await fetchRequiredChecks(config, branch);
    cache.set(key, JSON.stringify({ fetchedAt: Date.now(), checks } satisfies CachedRequiredChecks));
    return checks;
  } catch {
    return cached?.checks ?? [];
  }
}

async function loadQueue(useDemo: boolean): Promise<QueueSnapshot> {
  if (useDemo) {
    return parseQueue(DEMO_REPO, demoQueue(), DEMO_REQUIRED_CHECKS);
  }
  const config = getConfig();
  return fetchQueue(config, (branch) => requiredChecks(config, branch));
}

export function useMergeQueue() {
  return useCachedPromise(loadQueue, [demo], { keepPreviousData: true });
}

export async function loadJob(jobId: number) {
  if (demo) {
    return { job: demoJob(), annotations: DEMO_ANNOTATIONS };
  }
  const config = getConfig();
  const [job, annotations] = await Promise.all([
    fetchJob(config, jobId),
    fetchAnnotations(config, jobId).catch((): Annotation[] => []),
  ]);
  return { job, annotations };
}

export async function loadLogSummary(jobId: number) {
  return summarizeLog(demo ? DEMO_LOG : await fetchJobLog(getConfig(), jobId));
}

export async function requestRerunFailed(runIds: number[]) {
  if (demo) {
    return;
  }
  const config = getConfig();
  for (const runId of runIds) {
    await rerunFailedJobs(config, runId);
  }
}

export async function requestRerunJob(jobId: number) {
  if (!demo) {
    await rerunJob(getConfig(), jobId);
  }
}
