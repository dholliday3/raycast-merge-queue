import { Annotation, Job } from "./jobs";
import { QueueResponse, RawCheckRun, RawEntry } from "./queue";
import { RepoChoice } from "./repos";

export const DEMO_REPO = { owner: "acme", name: "storefront", branch: "main" };

const demoChoice = (slug: string, fields: Partial<RepoChoice>): RepoChoice => {
  const [owner, name] = slug.split("/");
  return { owner, name, slug, isPrivate: true, stars: 0, yourQueued: 0, defaultBranch: "main", ...fields };
};

export const DEMO_CHOICES: RepoChoice[] = [
  demoChoice("acme/storefront", { queueBranch: "main", queued: 6, yourQueued: 2, pushedAt: "2026-10-07T14:20:00Z" }),
  demoChoice("acme/payments", { queueBranch: "main", queued: 2, pushedAt: "2026-10-07T13:05:00Z" }),
  demoChoice("acme/mobile", { queueBranch: "develop", defaultBranch: "main", pushedAt: "2026-10-07T11:40:00Z" }),
  demoChoice("acme/design-system", { queueBranch: "main", queued: 0, pushedAt: "2026-10-06T22:10:00Z" }),
  demoChoice("acme/docs", { pushedAt: "2026-10-06T18:00:00Z" }),
  demoChoice("acme/infra", { pushedAt: "2026-10-05T09:30:00Z" }),
];
export const DEMO_REQUIRED_CHECKS = ["build", "lint", "typecheck", "unit tests", "e2e (chromium)", "migrations"];
export const DEMO_FAILING_JOB_ID = 9100;

type RunState = "success" | "failure" | "running" | "queued" | "skipped";

const minutesAgo = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

const WORKFLOWS: Record<string, string> = {
  build: "CI",
  lint: "CI",
  typecheck: "CI",
  "unit tests": "CI",
  migrations: "CI",
  "e2e (chromium)": "E2E",
  "e2e (webkit)": "E2E",
  "bundle size": "Quality",
  lighthouse: "Quality",
  "security audit": "Quality",
};

let nextId = 9000;

function checkRun(now: Date, name: string, state: RunState, minutes: number, length: number): RawCheckRun {
  const id = name === "e2e (chromium)" && state === "failure" ? DEMO_FAILING_JOB_ID : nextId++;
  const started = state === "queued" ? null : minutesAgo(now, minutes);
  const finished = state === "success" || state === "failure" || state === "skipped";
  return {
    __typename: "CheckRun",
    databaseId: id,
    name,
    status: finished ? "COMPLETED" : state === "running" ? "IN_PROGRESS" : "QUEUED",
    conclusion: finished ? state.toUpperCase() : null,
    detailsUrl: `https://github.com/acme/storefront/actions/runs/7000/job/${id}`,
    startedAt: started,
    completedAt: finished ? minutesAgo(now, Math.max(0, minutes - length)) : null,
    checkSuite: { workflowRun: { databaseId: 7000 + id, workflow: { name: WORKFLOWS[name] ?? "CI" } } },
  };
}

function entry(
  now: Date,
  fields: {
    position: number;
    number: number;
    title: string;
    author: string;
    state: string;
    enqueuedMinutesAgo: number;
    eta?: number;
    checks: RawCheckRun[];
  },
): RawEntry {
  return {
    id: `entry-${fields.number}`,
    position: fields.position,
    state: fields.state,
    estimatedTimeToMerge: fields.eta ?? null,
    enqueuedAt: minutesAgo(now, fields.enqueuedMinutesAgo),
    enqueuer: { login: fields.author },
    pullRequest: {
      number: fields.number,
      title: fields.title,
      url: `https://github.com/acme/storefront/pull/${fields.number}`,
      headRefName: `${fields.author}/${fields.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      author: { login: fields.author, avatarUrl: "" },
    },
    headCommit: { statusCheckRollup: { contexts: { nodes: fields.checks } } },
  };
}

function suite(now: Date, states: Partial<Record<string, RunState>>, minutes: number): RawCheckRun[] {
  return Object.keys(WORKFLOWS).map((name, index) =>
    checkRun(now, name, states[name] ?? "success", minutes - (index % 3), 4 + (index % 5) * 3),
  );
}

export function demoQueue(now = new Date()): QueueResponse {
  nextId = 9000;
  return {
    viewer: { login: "you" },
    repository: {
      defaultBranchRef: { name: "main" },
      mergeQueue: {
        url: "https://github.com/acme/storefront/queue/main",
        entries: {
          nodes: [
            entry(now, {
              position: 1,
              number: 4812,
              title: "Bump the checkout SDK to 3.2",
              author: "mira",
              state: "LOCKED",
              enqueuedMinutesAgo: 41,
              checks: suite(now, {}, 30),
            }),
            entry(now, {
              position: 2,
              number: 4807,
              title: "Add saved carts to the account page",
              author: "you",
              state: "AWAITING_CHECKS",
              enqueuedMinutesAgo: 26,
              eta: 14 * 60,
              checks: suite(
                now,
                { "e2e (chromium)": "running", "e2e (webkit)": "running", migrations: "running", lighthouse: "queued" },
                12,
              ),
            }),
            entry(now, {
              position: 3,
              number: 4815,
              title: "Fix currency rounding on partial refunds",
              author: "jonah",
              state: "UNMERGEABLE",
              enqueuedMinutesAgo: 22,
              checks: suite(now, { "e2e (chromium)": "failure", lighthouse: "failure" }, 20),
            }),
            entry(now, {
              position: 4,
              number: 4820,
              title: "Move product search to the new index",
              author: "priya",
              state: "AWAITING_CHECKS",
              enqueuedMinutesAgo: 15,
              eta: 23 * 60,
              checks: suite(
                now,
                {
                  "unit tests": "running",
                  "e2e (chromium)": "running",
                  "e2e (webkit)": "queued",
                  "bundle size": "failure",
                },
                9,
              ),
            }),
            entry(now, {
              position: 5,
              number: 4822,
              title: "Remove the legacy coupon endpoint",
              author: "sam",
              state: "UNMERGEABLE",
              enqueuedMinutesAgo: 9,
              checks: [],
            }),
            entry(now, {
              position: 6,
              number: 4825,
              title: "Tidy up order confirmation emails",
              author: "you",
              state: "QUEUED",
              enqueuedMinutesAgo: 3,
              eta: 38 * 60,
              checks: [],
            }),
          ],
        },
      },
    },
  };
}

export function demoJob(now = new Date()): Job {
  const step = (number: number, name: string, conclusion: string, start: number, end: number) => ({
    number,
    name,
    status: "completed",
    conclusion,
    startedAt: minutesAgo(now, start),
    completedAt: minutesAgo(now, end),
  });
  return {
    id: DEMO_FAILING_JOB_ID,
    runId: 16100,
    runAttempt: 1,
    name: "e2e (chromium)",
    status: "completed",
    conclusion: "failure",
    htmlUrl: `https://github.com/acme/storefront/actions/runs/16100/job/${DEMO_FAILING_JOB_ID}`,
    runUrl: "https://github.com/acme/storefront/actions/runs/16100",
    startedAt: minutesAgo(now, 20),
    completedAt: minutesAgo(now, 6),
    workflowName: "E2E",
    runnerName: "ubuntu-latest-8-core",
    steps: [
      step(1, "Set up job", "success", 20, 20),
      step(2, "Check out code", "success", 20, 19),
      step(3, "Install dependencies", "success", 19, 17),
      step(4, "Start the app", "success", 17, 16),
      step(5, "Run Playwright", "failure", 16, 6),
      step(6, "Upload report", "success", 6, 6),
      step(7, "Complete job", "success", 6, 6),
    ],
  };
}

export const DEMO_ANNOTATIONS: Annotation[] = [
  {
    level: "failure",
    path: "e2e/refunds.spec.ts",
    line: 48,
    title: "[chromium] › refunds.spec.ts:31:3 › partial refund rounds to the cent",
    message: 'Expected "$12.35", received "$12.34"',
  },
];

export const DEMO_LOG = [
  "2026-10-07T14:02:11.0000000Z ##[group]Run npx playwright test --project=chromium",
  "2026-10-07T14:02:11.0000000Z npx playwright test --project=chromium",
  "2026-10-07T14:02:11.0000000Z ##[endgroup]",
  "2026-10-07T14:02:14.0000000Z Running 212 tests using 4 workers",
  "2026-10-07T14:11:40.0000000Z   1) [chromium] › refunds.spec.ts:31:3 › partial refund rounds to the cent ──────────",
  "2026-10-07T14:11:40.0000000Z ",
  "2026-10-07T14:11:40.0000000Z     Error: expect(locator).toHaveText(expected) failed",
  "2026-10-07T14:11:40.0000000Z ",
  '2026-10-07T14:11:40.0000000Z     Expected: "$12.35"',
  '2026-10-07T14:11:40.0000000Z     Received: "$12.34"',
  "2026-10-07T14:11:40.0000000Z ",
  "2026-10-07T14:11:40.0000000Z       46 |     await page.getByRole('button', { name: 'Refund' }).click();",
  "2026-10-07T14:11:40.0000000Z       47 |     const total = page.getByTestId('refund-total');",
  "2026-10-07T14:11:40.0000000Z     > 48 |     await expect(total).toHaveText('$12.35');",
  "2026-10-07T14:11:40.0000000Z          |                         ^",
  "2026-10-07T14:11:40.0000000Z ",
  "2026-10-07T14:11:40.0000000Z         at e2e/refunds.spec.ts:48:25",
  "2026-10-07T14:11:41.0000000Z ",
  "2026-10-07T14:11:41.0000000Z   1 failed",
  "2026-10-07T14:11:41.0000000Z     [chromium] › refunds.spec.ts:31:3 › partial refund rounds to the cent",
  "2026-10-07T14:11:41.0000000Z   1 flaky",
  "2026-10-07T14:11:41.0000000Z     [chromium] › cart.spec.ts:88:5 › applies a gift card after a coupon",
  "2026-10-07T14:11:41.0000000Z   210 passed (9.4m)",
  "2026-10-07T14:11:42.0000000Z ##[error]Process completed with exit code 1.",
].join("\n");
