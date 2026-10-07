import { describe, expect, it } from "vitest";
import { DEMO_ANNOTATIONS, DEMO_LOG, demoJob } from "../src/lib/demo";
import { summarizeLog } from "../src/lib/logs";
import { buildCopyText, buildJobMarkdown, keyErrors } from "../src/lib/report";

const ts = (line: string) => `2026-10-07T14:00:00.0000000Z ${line}`;

describe("summarizeLog with Playwright", () => {
  const summary = summarizeLog(DEMO_LOG);

  it("lists failed and flaky tests from the summary", () => {
    expect(summary.failedTests).toEqual(["[chromium] › refunds.spec.ts:31:3 › partial refund rounds to the cent"]);
    expect(summary.flakyTests).toEqual(["[chromium] › cart.spec.ts:88:5 › applies a gift card after a coupon"]);
  });

  it("keeps the totals", () => expect(summary.testTotals).toEqual(["1 failed", "1 flaky", "210 passed (9.4m)"]));

  it("names the failing step", () => expect(summary.failingStep).toBe("npx playwright test --project=chromium"));

  it("starts the excerpt at the first failure and drops timestamps", () => {
    expect(summary.excerpt[0]).toMatch(/^\s+1\) \[chromium\]/);
    expect(summary.excerpt.some((line) => /^\d{4}-\d{2}-\d{2}T/.test(line))).toBe(false);
  });

  it("ignores the exit code line as an error", () => expect(summary.errors).toEqual([]));
});

describe("summarizeLog with Vitest", () => {
  const log = [
    ts("##[group]Run npm test"),
    ts("npm test"),
    ts("##[endgroup]"),
    ts(" FAIL  src/cart.test.ts > applies coupons"),
    ts("AssertionError: expected 3 to be 2"),
    ts(" Test Files  1 failed | 41 passed (42)"),
    ts("      Tests  1 failed | 380 passed (381)"),
    ts("##[error]Process completed with exit code 1."),
  ].join("\n");
  const summary = summarizeLog(log);

  it("lists failing tests", () => expect(summary.failedTests).toEqual(["src/cart.test.ts > applies coupons"]));
  it("keeps the totals", () =>
    expect(summary.testTotals).toEqual(["Test Files 1 failed | 41 passed (42)", "Tests 1 failed | 380 passed (381)"]));
  it("names the failing step", () => expect(summary.failingStep).toBe("npm test"));
});

describe("summarizeLog with plain errors", () => {
  it("collects ##[error] lines and strips ANSI colors", () => {
    const log = [
      ts("##[group]Run npm run typecheck"),
      ts("##[endgroup]"),
      ts("\u001b[31msrc/a.ts(3,1): error TS2304\u001b[0m"),
      ts("##[error]src/a.ts(3,1): error TS2304: Cannot find name 'x'."),
      ts("##[error]Process completed with exit code 2."),
    ].join("\n");
    const summary = summarizeLog(log);
    expect(summary.errors).toEqual(["src/a.ts(3,1): error TS2304: Cannot find name 'x'."]);
    expect(summary.excerpt).toContain("src/a.ts(3,1): error TS2304");
  });
});

describe("job report", () => {
  const summary = summarizeLog(DEMO_LOG);
  const check = { name: "e2e (chromium)", state: "failure" as const, required: true, jobId: 9100, runId: 16100 };
  const input = {
    check,
    pr: { number: 4815, title: "Fix currency rounding", url: "https://github.com/acme/storefront/pull/4815" },
    job: demoJob(new Date("2026-10-07T14:30:00Z")),
    annotations: DEMO_ANNOTATIONS,
    log: { status: "loaded" as const, summary },
  };

  it("puts annotation failures first among key errors", () =>
    expect(keyErrors(DEMO_ANNOTATIONS, summary)[0]).toMatch(/^e2e\/refunds\.spec\.ts:48: /));

  it("bolds the failed step and shows the log excerpt", () => {
    const markdown = buildJobMarkdown(input);
    expect(markdown).toContain("**Run Playwright**");
    expect(markdown).toContain("## Failed Tests (1)");
    expect(markdown).toContain("## Log Excerpt");
  });

  it("copies a summary with links for pasting into chat", () => {
    const text = buildCopyText(input);
    expect(text.split("\n")[0]).toBe("e2e (chromium) failed on PR #4815 (Fix currency rounding)");
    expect(text).toContain("Job: https://github.com/acme/storefront/actions/runs/16100/job/9100");
    expect(text).toContain("Flaky tests:");
  });
});
