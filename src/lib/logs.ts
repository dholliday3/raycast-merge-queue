export type LogSummary = {
  errors: string[];
  failedTests: string[];
  flakyTests: string[];
  testTotals: string[];
  failingStep?: string;
  excerpt: string[];
};

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, "g");
const BYTE_ORDER_MARK = new RegExp(`^${String.fromCharCode(0xfeff)}`);
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z ?/;
const EXIT_CODE = /^Process completed with exit code \d+/;
const STEP_START = /^##\[group\]Run (.+)$/;
const RUNNER_META = /^##\[(group|endgroup|start-action|end-action|debug)\b/;
const PLAYWRIGHT_NUMBERED = /^\s+\d+\) (\[[^\]]+\] › .+?)\s*[─━]*\s*$/;
const PLAYWRIGHT_LISTED = /^\s{4}(\[[^\]]+\] › .+?)\s*$/;
const PLAYWRIGHT_TOTAL = /^\s+(\d+ (failed|flaky|passed|skipped|did not run|interrupted)(?: \([^)]*\))?)\s*$/;
const VITEST_FAILURE = /^\s*FAIL\s+(\S.*?)\s*$/;
const VITEST_TOTAL = /^\s*((Test Files|Tests)\s{2,}.+?)\s*$/;
const FAILURE_HEADER = /⎯+ Failed Tests \d+ ⎯+|^\s+1\) \[[^\]]+\] › /;

const MAX_ERRORS = 15;
const MAX_TESTS = 20;
const EXCERPT_LINES = 80;

function normalise(raw: string): string[] {
  return raw
    .replace(BYTE_ORDER_MARK, "")
    .split(/\r?\n/)
    .map((line) => line.replace(ANSI, "").replace(TIMESTAMP, ""));
}

function pushUnique(target: string[], value: string, max: number) {
  const trimmed = value.trim();
  if (trimmed && !target.includes(trimmed) && target.length < max) {
    target.push(trimmed);
  }
}

function lastIndexMatching(lines: string[], pattern: RegExp, before = lines.length): number {
  for (let index = Math.min(before, lines.length) - 1; index >= 0; index--) {
    if (pattern.test(lines[index])) {
      return index;
    }
  }
  return -1;
}

function firstIndexMatching(lines: string[], pattern: RegExp, from: number, to: number): number {
  for (let index = Math.max(0, from); index < Math.min(to, lines.length); index++) {
    if (pattern.test(lines[index])) {
      return index;
    }
  }
  return -1;
}

function excerptFor(lines: string[]): { failingStep?: string; excerpt: string[] } {
  const exitIndex = lastIndexMatching(lines, /##\[error\]Process completed with exit code/);
  const failureEnd = exitIndex >= 0 ? exitIndex : lastIndexMatching(lines, /##\[error\]/);
  const end = failureEnd >= 0 ? failureEnd : lines.length;
  const stepIndex = lastIndexMatching(lines, STEP_START, end);
  const failingStep = stepIndex >= 0 ? STEP_START.exec(lines[stepIndex])?.[1]?.trim() : undefined;

  const commandEcho = stepIndex >= 0 ? firstIndexMatching(lines, /^##\[endgroup\]/, stepIndex, end) : -1;
  const stepStart =
    commandEcho >= 0 ? commandEcho + 1 : stepIndex >= 0 ? stepIndex + 1 : Math.max(0, end - EXCERPT_LINES);
  const headerIndex = firstIndexMatching(lines, FAILURE_HEADER, stepStart, end);
  const firstErrorIndex = firstIndexMatching(lines, /##\[error\]/, stepStart, end);
  const anchor =
    headerIndex >= 0
      ? headerIndex
      : firstErrorIndex >= 0
        ? Math.max(stepStart, firstErrorIndex - 40)
        : Math.max(stepStart, end - EXCERPT_LINES);

  const excerpt = lines
    .slice(anchor, end)
    .filter((line) => !RUNNER_META.test(line))
    .map((line) => line.replace("##[error]", "✖ "))
    .slice(0, EXCERPT_LINES);

  while (excerpt.length > 0 && excerpt[excerpt.length - 1].trim() === "") {
    excerpt.pop();
  }
  return { failingStep, excerpt };
}

export function summarizeLog(raw: string): LogSummary {
  const lines = normalise(raw);
  const errors: string[] = [];
  const failedTests: string[] = [];
  const flakyTests: string[] = [];
  const numberedFailures: string[] = [];
  const totals = new Map<string, string>();
  let listing: string[] | undefined;

  for (const line of lines) {
    const errorAt = line.indexOf("##[error]");
    if (errorAt >= 0) {
      listing = undefined;
      const message = line.slice(errorAt + "##[error]".length);
      if (!EXIT_CODE.test(message)) {
        pushUnique(errors, message.length > 300 ? `${message.slice(0, 300)}…` : message, MAX_ERRORS);
      }
      continue;
    }

    const playwrightTotal = PLAYWRIGHT_TOTAL.exec(line);
    if (playwrightTotal) {
      totals.set(`playwright ${playwrightTotal[2]}`, playwrightTotal[1]);
      listing =
        playwrightTotal[2] === "failed" || playwrightTotal[2] === "interrupted"
          ? failedTests
          : playwrightTotal[2] === "flaky"
            ? flakyTests
            : undefined;
      continue;
    }

    const listed = listing ? PLAYWRIGHT_LISTED.exec(line) : null;
    if (listing && listed) {
      pushUnique(listing, listed[1], MAX_TESTS);
      continue;
    }
    listing = undefined;

    const numbered = PLAYWRIGHT_NUMBERED.exec(line);
    if (numbered) {
      pushUnique(numberedFailures, numbered[1], MAX_TESTS);
      continue;
    }

    const vitest = VITEST_FAILURE.exec(line);
    if (vitest && !line.includes("##[")) {
      pushUnique(failedTests, vitest[1], MAX_TESTS);
      continue;
    }

    const vitestTotal = VITEST_TOTAL.exec(line);
    if (vitestTotal) {
      totals.set(`vitest ${vitestTotal[2]}`, vitestTotal[1].replace(/\s{2,}/g, " "));
    }
  }

  if (failedTests.length === 0) {
    for (const test of numberedFailures) {
      if (!flakyTests.includes(test)) {
        pushUnique(failedTests, test, MAX_TESTS);
      }
    }
  }

  return {
    errors,
    failedTests,
    flakyTests,
    testTotals: [...totals.values()],
    ...excerptFor(lines),
  };
}
