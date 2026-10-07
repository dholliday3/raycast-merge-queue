import { formatSeconds, secondsBetween } from "./format";
import { Annotation, Job, JobStep } from "./jobs";
import { LogSummary } from "./logs";
import { Check } from "./queue";

export type LogState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "unavailable"; reason: string }
  | { status: "loaded"; summary: LogSummary }
  | { status: "error"; message: string };

export type JobReportInput = {
  check: Check;
  pr?: { number: number; title: string; url: string };
  job?: Job;
  annotations?: Annotation[];
  log: LogState;
};

const CHECK_EMOJI: Record<Check["state"], string> = {
  failure: "❌",
  pending: "⏳",
  success: "✅",
  skipped: "⏭️",
  neutral: "⚪️",
};

function stepEmoji(step: JobStep): string {
  if (step.status !== "completed") {
    return step.status === "in_progress" ? "⏳" : "⚪️";
  }
  switch (step.conclusion) {
    case "success":
      return "✅";
    case "skipped":
      return "⏭️";
    case "cancelled":
      return "⛔️";
    case "failure":
    case "timed_out":
      return "❌";
    default:
      return "⚪️";
  }
}

function inlineCode(text: string): string {
  return `\`${text.replace(/`/g, "'").replace(/\s+/g, " ").trim()}\``;
}

function fence(lines: string[]): string {
  return ["```text", lines.join("\n").replace(/```/g, "'''"), "```"].join("\n");
}

function duration(start?: string, end?: string): string | undefined {
  const seconds = secondsBetween(start, end);
  return seconds === undefined ? undefined : formatSeconds(seconds);
}

export function keyErrors(annotations: Annotation[] | undefined, log: LogSummary | undefined): string[] {
  const messages: string[] = [];
  const add = (message: string) => {
    const text = message.replace(/\s+/g, " ").trim();
    if (text && !/^Process completed with exit code/.test(text) && !messages.some((m) => m.includes(text))) {
      messages.push(text);
    }
  };
  for (const annotation of annotations ?? []) {
    if (annotation.level !== "failure") {
      continue;
    }
    const location =
      annotation.path && annotation.path !== ".github"
        ? `${annotation.path}${annotation.line ? `:${annotation.line}` : ""}: `
        : "";
    add(`${location}${annotation.title ? `${annotation.title}: ` : ""}${annotation.message}`);
  }
  for (const error of log?.errors ?? []) {
    add(error);
  }
  return messages.slice(0, 15);
}

function isFailedStep(step: JobStep): boolean {
  return step.conclusion === "failure" || step.conclusion === "timed_out";
}

export function failingStepName(job: Job | undefined, summary: LogSummary | undefined): string | undefined {
  return job?.steps.find(isFailedStep)?.name ?? summary?.failingStep;
}

function stepsSection(job: Job): string[] {
  if (job.steps.length === 0) {
    return [];
  }
  const lines = ["## Steps", ""];
  for (const step of job.steps) {
    const time = duration(step.startedAt, step.completedAt);
    const name = isFailedStep(step) ? `**${step.name}**` : step.name;
    lines.push(`- ${stepEmoji(step)} ${name}${time ? ` · ${time}` : ""}`);
  }
  return lines;
}

function testsSection(log: LogSummary): string[] {
  const lines: string[] = [];
  if (log.failedTests.length > 0) {
    lines.push(
      `## Failed Tests (${log.failedTests.length})`,
      "",
      ...log.failedTests.map((test) => `- ${inlineCode(test)}`),
      "",
    );
  }
  if (log.flakyTests.length > 0) {
    lines.push(
      `## Flaky Tests (${log.flakyTests.length})`,
      "",
      ...log.flakyTests.map((test) => `- ${inlineCode(test)}`),
      "",
    );
  }
  if (log.testTotals.length > 0) {
    lines.push(`_${log.testTotals.join(" · ")}_`, "");
  }
  return lines;
}

function logSection(log: LogState, stepName?: string): string[] {
  switch (log.status) {
    case "idle":
      return ["## Log", "", "_Not loaded. Use **Load Log** (⌘L) to fetch it._"];
    case "loading":
      return ["## Log", "", "_Loading log…_"];
    case "error":
      return ["## Log", "", `_Couldn't load the log: ${log.message}_`];
    case "unavailable":
      return ["## Log", "", `_${log.reason}_`];
    case "loaded":
      return log.summary.excerpt.length === 0
        ? ["## Log", "", "_Nothing useful found in the log._"]
        : [`## Log Excerpt${stepName ? ` · ${inlineCode(stepName)}` : ""}`, "", fence(log.summary.excerpt)];
  }
}

export function buildJobMarkdown(input: JobReportInput): string {
  const { check, job, annotations, log } = input;
  const summary = log.status === "loaded" ? log.summary : undefined;
  const lines = [`# ${CHECK_EMOJI[check.state]} ${check.name}`, ""];

  const errors = keyErrors(annotations, summary);
  if (errors.length > 0) {
    lines.push("## Key Errors", "", ...errors.map((error) => `- ${inlineCode(error)}`), "");
  }
  if (summary) {
    lines.push(...testsSection(summary));
  }
  if (job) {
    lines.push(...stepsSection(job), "");
  }
  lines.push(...logSection(log, failingStepName(job, summary)));
  return lines.join("\n");
}

export function buildCopyText(input: JobReportInput): string {
  const { check, pr, job, annotations, log } = input;
  const summary = log.status === "loaded" ? log.summary : undefined;
  const lines = [
    `${check.name} ${check.state === "failure" ? "failed" : `is ${check.state}`}${pr ? ` on PR #${pr.number} (${pr.title})` : ""}`,
  ];
  if (pr) {
    lines.push(`PR: ${pr.url}`);
  }
  if (job) {
    lines.push(`Job: ${job.htmlUrl}`);
  } else if (check.url) {
    lines.push(`Check: ${check.url}`);
  }
  const errors = keyErrors(annotations, summary);
  if (errors.length > 0) {
    lines.push("", "Key errors:", ...errors.map((error) => `- ${error}`));
  }
  if (summary?.failedTests.length) {
    lines.push("", "Failed tests:", ...summary.failedTests.map((test) => `- ${test}`));
  }
  if (summary?.flakyTests.length) {
    lines.push("", "Flaky tests:", ...summary.flakyTests.map((test) => `- ${test}`));
  }
  if (summary?.testTotals.length) {
    lines.push("", `Totals: ${summary.testTotals.join(" · ")}`);
  }
  if (summary?.excerpt.length) {
    const stepName = failingStepName(job, summary);
    lines.push("", `Log excerpt${stepName ? ` (${stepName})` : ""}:`, fence(summary.excerpt));
  }
  return lines.join("\n");
}
