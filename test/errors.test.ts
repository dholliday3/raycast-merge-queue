import { describe, expect, it } from "vitest";
import { describeError, logErrorMessage } from "../src/lib/errors";
import { classifyGhMessage, GhError } from "../src/lib/gh";
import { parseQueue } from "../src/lib/queue";

describe("classifyGhMessage, with messages gh really prints", () => {
  it.each([
    ["Could not resolve to a Repository with the name 'nope-owner-xyz/nope'.", "not-found"],
    ["Not Found (HTTP 404)", "not-found"],
    ["Bad credentials (HTTP 401)", "unauthenticated"],
    ["To get started with GitHub CLI, please run:  gh auth login", "unauthenticated"],
    [
      'Get "https://api.github.com/user": proxyconnect tcp: dial tcp 127.0.0.1:9: connect: connection refused',
      "offline",
    ],
    ["error connecting to api.github.com\ncheck your internet connection", "offline"],
    ["API rate limit exceeded for user ID 1. (HTTP 403)", "rate-limited"],
    ["Must have admin rights to Repository. (HTTP 403)", "forbidden"],
    ["Gone (HTTP 410)", "gone"],
    ["something unexpected", "other"],
  ])("%s → %s", (message, kind) => expect(classifyGhMessage(message)).toBe(kind));
});

describe("describeError", () => {
  it("tells you to install gh and copies the command", () => {
    const advice = describeError(new GhError("GitHub CLI not found at /opt/homebrew/bin/gh", "missing"));
    expect([advice.title, advice.command, advice.canSwitch]).toEqual([
      "GitHub CLI isn't installed",
      "brew install gh && gh auth login",
      false,
    ]);
  });

  it("names the repository it can't see and offers to switch", () => {
    const advice = describeError(new GhError("x", "not-found", { repo: "acme/web" }));
    expect([advice.title, advice.command, advice.canSwitch]).toEqual(["Can't see acme/web", "gh auth status", true]);
  });

  it("explains a missing merge queue with the branch it checked", () => {
    const data = { viewer: { login: "you" }, repository: { defaultBranchRef: { name: "main" }, mergeQueue: null } };
    let error: unknown;
    try {
      parseQueue({ owner: "acme", name: "web" }, data, []);
    } catch (caught) {
      error = caught;
    }
    const advice = describeError(error);
    expect(advice.title).toBe("acme/web has no merge queue");
    expect(advice.description).toContain("on main");
    expect(advice.canSwitch).toBe(true);
  });

  it("keeps the raw message for anything unrecognized", () =>
    expect(describeError(new Error("boom")).description).toBe("boom"));
});

describe("logErrorMessage", () => {
  it("explains expired logs", () =>
    expect(logErrorMessage(new GhError("Not Found (HTTP 404)", "not-found"))).toMatch(/isn't available anymore/));
  it("explains being offline", () =>
    expect(logErrorMessage(new GhError("dial tcp", "offline"))).toMatch(/^Can't reach GitHub\./));
});
