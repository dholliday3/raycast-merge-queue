import { Cache, getPreferenceValues, LocalStorage } from "@raycast/api";
import { useCachedPromise, useLocalStorage } from "@raycast/utils";
import {
  DEMO_ANNOTATIONS,
  DEMO_CHOICES,
  DEMO_LOG,
  DEMO_REPO,
  DEMO_REQUIRED_CHECKS,
  demoJob,
  demoQueue,
} from "./lib/demo";
import { findGh, GhError, RepoConfig, repoSlug } from "./lib/gh";
import { Annotation, fetchAnnotations, fetchJob, fetchJobLog, rerunFailedJobs, rerunJob } from "./lib/jobs";
import { summarizeLog } from "./lib/logs";
import { fetchQueue, fetchRequiredChecks, parseQueue, QueueSnapshot } from "./lib/queue";
import { fetchRepoChoices, rememberRecent, RepoChoice, RepoSelection, RepoSort, searchRepoChoices } from "./lib/repos";

export type MergeQueueLaunchContext = { prNumber?: number; view?: "checks" | "repositories"; demo?: boolean };

type CachedRequiredChecks = { fetchedAt: number; checks: string[] };

const SELECTION_KEY = "repository";
const RECENTS_KEY = "recent-repositories";
const DEMO_RECENTS: RepoSelection[] = [DEMO_REPO, { owner: "acme", name: "payments", branch: "main" }];
const REQUIRED_CHECKS_TTL_MS = 60 * 60 * 1000;
const cache = new Cache();

let demo = false;

export function enableDemo(enabled: boolean | undefined) {
  demo = demo || Boolean(enabled);
}

export function isDemo(): boolean {
  return demo;
}

function ghConfig(): Pick<RepoConfig, "ghPath"> {
  const preferred = getPreferenceValues<Preferences>().ghPath?.trim() || undefined;
  return { ghPath: findGh(preferred) ?? preferred ?? "/opt/homebrew/bin/gh" };
}

function toConfig(selection: RepoSelection): RepoConfig {
  return { ...ghConfig(), owner: selection.owner, name: selection.name, branch: selection.branch };
}

async function storedSelection(): Promise<RepoSelection | undefined> {
  const raw = await LocalStorage.getItem<string>(SELECTION_KEY);
  return raw ? (JSON.parse(raw) as RepoSelection) : undefined;
}

export async function getConfig(): Promise<RepoConfig> {
  const selection = demo ? DEMO_REPO : await storedSelection();
  if (!selection) {
    throw new GhError("Choose a repository first");
  }
  return toConfig(selection);
}

export function useSelection() {
  const stored = useLocalStorage<RepoSelection>(SELECTION_KEY);
  const recents = useLocalStorage<RepoSelection[]>(RECENTS_KEY, []);
  const setSelection = async (selection: RepoSelection) => {
    if (demo) {
      return;
    }
    await stored.setValue(selection);
    await recents.setValue(rememberRecent(recents.value ?? [], selection));
  };
  return {
    selection: demo ? DEMO_REPO : stored.value,
    recents: demo ? DEMO_RECENTS : (recents.value ?? []),
    setSelection,
    isLoading: stored.isLoading && !demo,
  };
}

export function selectionFor(choice: RepoChoice, branch?: string): RepoSelection {
  return { owner: choice.owner, name: choice.name, branch: branch ?? choice.queueBranch };
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

async function loadQueue(useDemo: boolean, owner: string, name: string, branch?: string): Promise<QueueSnapshot> {
  if (useDemo) {
    return parseQueue(DEMO_REPO, demoQueue(), DEMO_REQUIRED_CHECKS);
  }
  const config = toConfig({ owner, name, branch });
  return fetchQueue(config, (resolved) => requiredChecks(config, resolved));
}

export function useMergeQueue(selection: RepoSelection | undefined) {
  return useCachedPromise(loadQueue, [demo, selection?.owner ?? "", selection?.name ?? "", selection?.branch], {
    keepPreviousData: true,
    execute: Boolean(selection),
  });
}

async function loadChoices(useDemo: boolean): Promise<RepoChoice[]> {
  return useDemo ? DEMO_CHOICES : fetchRepoChoices(ghConfig());
}

async function loadSearch(useDemo: boolean, text: string, sort: RepoSort): Promise<RepoChoice[]> {
  if (useDemo) {
    return DEMO_CHOICES.filter((choice) => choice.slug.includes(text.trim().toLowerCase()));
  }
  return searchRepoChoices(ghConfig(), text, sort);
}

export function useRepoChoices(options: { execute?: boolean } = {}) {
  return useCachedPromise(loadChoices, [demo], { keepPreviousData: true, execute: options.execute ?? true });
}

export function useRepoSearch(text: string, sort: RepoSort) {
  return useCachedPromise(loadSearch, [demo, text, sort], {
    keepPreviousData: true,
    execute: text.trim().length >= 2,
  });
}

export async function loadJob(jobId: number) {
  if (demo) {
    return { job: demoJob(), annotations: DEMO_ANNOTATIONS };
  }
  const config = await getConfig();
  const [job, annotations] = await Promise.all([
    fetchJob(config, jobId),
    fetchAnnotations(config, jobId).catch((): Annotation[] => []),
  ]);
  return { job, annotations };
}

export async function loadLogSummary(jobId: number) {
  return summarizeLog(demo ? DEMO_LOG : await fetchJobLog(await getConfig(), jobId));
}

export async function requestRerunFailed(runIds: number[]) {
  if (demo) {
    return;
  }
  const config = await getConfig();
  for (const runId of runIds) {
    await rerunFailedJobs(config, runId);
  }
}

export async function requestRerunJob(jobId: number) {
  if (!demo) {
    await rerunJob(await getConfig(), jobId);
  }
}
