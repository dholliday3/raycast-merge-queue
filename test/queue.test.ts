import { describe, expect, it } from "vitest";
import { DEMO_REPO, DEMO_REQUIRED_CHECKS, demoQueue } from "../src/lib/demo";
import { GhError, parseRepository, setupCommand } from "../src/lib/gh";
import { failingRunIds, parseQueue, primaryFailingJob, QueueResponse, queueBranch } from "../src/lib/queue";

const now = new Date("2026-10-07T14:30:00Z");
const snapshot = () => parseQueue(DEMO_REPO, demoQueue(now), DEMO_REQUIRED_CHECKS, now);
const byNumber = (number: number) => snapshot().entries.find((entry) => entry.pr.number === number)!;

describe("parseQueue", () => {
  it("orders entries by position and marks the viewer's", () => {
    const entries = snapshot().entries;
    expect(entries.map((entry) => entry.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(entries.filter((entry) => entry.isMine).map((entry) => entry.pr.number)).toEqual([4807, 4825]);
  });

  it("reads each entry's health", () => {
    expect(snapshot().entries.map((entry) => [entry.pr.number, entry.health])).toEqual([
      [4812, "merging"],
      [4807, "running"],
      [4815, "failing"],
      [4820, "running"],
      [4822, "conflict"],
      [4825, "queued"],
    ]);
  });

  it("splits failures into required and optional", () => {
    const entry = byNumber(4815);
    expect(entry.failingRequired.map((check) => check.name)).toEqual(["e2e (chromium)"]);
    expect(entry.failingOptional.map((check) => check.name)).toEqual(["lighthouse"]);
  });

  it("keeps an optional failure from failing the entry", () => {
    const entry = byNumber(4820);
    expect(entry.health).toBe("running");
    expect(entry.failingOptional.map((check) => check.name)).toEqual(["bundle size"]);
  });

  it("counts required checks that finished without failing", () => {
    const entry = byNumber(4807);
    expect([entry.requiredDone, entry.requiredTotal]).toEqual([4, 6]);
  });

  it("sorts failures first, then running, then the rest", () => {
    const states = byNumber(4815).checks.map((check) => check.state);
    expect(states.slice(0, 2)).toEqual(["failure", "failure"]);
    expect(states.slice(2).every((state) => state === "success")).toBe(true);
  });

  it("uses the branch from preferences, else the repository's default", () => {
    const data = demoQueue(now);
    expect(queueBranch({ branch: "release" }, data)).toBe("release");
    expect(queueBranch({ branch: undefined }, data)).toBe("main");
  });

  it("says when a repository has no merge queue", () => {
    const data: QueueResponse = {
      viewer: { login: "you" },
      repository: { defaultBranchRef: { name: "trunk" }, mergeQueue: null },
    };
    expect(() => parseQueue({ owner: "a", name: "b" }, data, [])).toThrow("a/b has no merge queue on trunk");
  });

  it("says when the repository can't be found", () => {
    expect(() => parseQueue({ owner: "a", name: "b" }, { viewer: { login: "you" }, repository: null }, [])).toThrow(
      "Couldn't find a/b",
    );
  });
});

describe("failing jobs", () => {
  it("collects each failing workflow run once", () => {
    expect(failingRunIds(byNumber(4815))).toHaveLength(2);
    expect(failingRunIds(byNumber(4825))).toEqual([]);
  });

  it("shows a required failure before a longer optional one", () => {
    expect(primaryFailingJob(byNumber(4815))?.name).toBe("e2e (chromium)");
  });
});

describe("parseRepository", () => {
  it("accepts owner/name", () =>
    expect(parseRepository("acme/storefront")).toEqual({ owner: "acme", name: "storefront" }));
  it("accepts a GitHub URL", () =>
    expect(parseRepository("https://github.com/acme/storefront.git")).toEqual({ owner: "acme", name: "storefront" }));
  it("rejects anything else", () => expect(() => parseRepository("storefront")).toThrow(GhError));
});

describe("setupCommand", () => {
  it("suggests installing gh when it's missing", () =>
    expect(setupCommand(new GhError("nope", "missing"))).toBe("brew install gh && gh auth login"));
  it("suggests signing in when gh isn't", () =>
    expect(setupCommand(new GhError("nope", "unauthenticated"))).toBe("gh auth login"));
  it("has nothing for other errors", () => expect(setupCommand(new Error("boom"))).toBeUndefined());
});
