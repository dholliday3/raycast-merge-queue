import { describe, expect, it } from "vitest";
import {
  ChoicesResponse,
  groupChoices,
  parseChoices,
  parseSearch,
  parseTypedRepo,
  RawRepo,
  rulesetQueueBranch,
  searchText,
  toChoice,
} from "../src/lib/repos";

function repo(slug: string, fields: Partial<RawRepo> = {}): RawRepo {
  return {
    nameWithOwner: slug,
    owner: { login: slug.split("/")[0], avatarUrl: "" },
    isPrivate: false,
    isArchived: false,
    stargazerCount: 0,
    pushedAt: "2026-10-01T00:00:00Z",
    defaultBranchRef: { name: "main" },
    mergeQueue: null,
    rulesets: { nodes: [] },
    ...fields,
  };
}

const queueRuleset = (include: string[], enforcement = "ACTIVE") => ({
  enforcement,
  conditions: { refName: { include } },
  rules: { totalCount: 1 },
});

describe("finding the merge queue's branch", () => {
  it("uses the default branch when GitHub reports a queue there", () => {
    const choice = toChoice(repo("acme/web", { mergeQueue: { entries: { totalCount: 4 } } }));
    expect([choice.queueBranch, choice.queued]).toEqual(["main", 4]);
  });

  it("reads a queue on another branch from rulesets", () =>
    expect(rulesetQueueBranch(repo("acme/web", { rulesets: { nodes: [queueRuleset(["refs/heads/develop"])] } }))).toBe(
      "develop",
    ));

  it("resolves ~DEFAULT_BRANCH", () =>
    expect(rulesetQueueBranch(repo("acme/web", { rulesets: { nodes: [queueRuleset(["~DEFAULT_BRANCH"])] } }))).toBe(
      "main",
    ));

  it("skips wildcards and rulesets that aren't enforced", () => {
    const rulesets = { nodes: [queueRuleset(["refs/heads/release/*"]), queueRuleset(["refs/heads/main"], "EVALUATE")] };
    expect(rulesetQueueBranch(repo("acme/web", { rulesets }))).toBeUndefined();
  });

  it("skips rulesets without a merge queue rule", () => {
    const rulesets = { nodes: [{ ...queueRuleset(["refs/heads/main"]), rules: { totalCount: 0 } }] };
    expect(toChoice(repo("acme/web", { rulesets })).queueBranch).toBeUndefined();
  });

  it("doesn't claim a count for a queue off the default branch", () => {
    const choice = toChoice(
      repo("acme/web", {
        mergeQueue: null,
        rulesets: { nodes: [queueRuleset(["refs/heads/develop"])] },
      }),
    );
    expect([choice.queueBranch, choice.queued]).toEqual(["develop", undefined]);
  });
});

describe("parseChoices", () => {
  const data: ChoicesResponse = {
    viewer: {
      pullRequests: {
        nodes: [
          { baseRefName: "develop", mergeQueueEntry: { position: 2 }, baseRepository: repo("acme/api") },
          { baseRefName: "develop", mergeQueueEntry: { position: 5 }, baseRepository: repo("acme/api") },
          { baseRefName: "main", mergeQueueEntry: null, baseRepository: repo("acme/web") },
        ],
      },
      repositories: {
        nodes: [
          repo("acme/api"),
          repo("acme/web", { mergeQueue: { entries: { totalCount: 1 } } }),
          repo("acme/old", { isArchived: true }),
        ],
      },
      repositoriesContributedTo: { nodes: [repo("oss/lib"), null] },
    },
  };
  const choices = parseChoices(data);

  it("puts repos with your queued PRs first, on their queue's branch", () =>
    expect(choices[0]).toMatchObject({ slug: "acme/api", queueBranch: "develop", yourQueued: 2 }));

  it("lists each repo once and leaves out archived ones", () =>
    expect(choices.map((choice) => choice.slug)).toEqual(["acme/api", "acme/web", "oss/lib"]));

  it("groups into yours, queue on, and the rest", () => {
    const groups = groupChoices(choices);
    expect([groups.yours, groups.withQueue, groups.others].map((group) => group.map((c) => c.slug))).toEqual([
      ["acme/api"],
      ["acme/web"],
      ["oss/lib"],
    ]);
  });
});

describe("sorting", () => {
  const choices = [
    toChoice(repo("a/old", { stargazerCount: 900, pushedAt: "2026-01-01T00:00:00Z" })),
    toChoice(repo("a/new", { stargazerCount: 5, pushedAt: "2026-10-01T00:00:00Z" })),
  ];
  it("sorts by last push", () => expect(groupChoices(choices, "pushed").others[0].slug).toBe("a/new"));
  it("sorts by stars", () => expect(groupChoices(choices, "stars").others[0].slug).toBe("a/old"));
  it("keeps GitHub's order for best match", () => expect(groupChoices(choices, "match").others[0].slug).toBe("a/old"));
});

describe("search", () => {
  it("puts an exact owner/name match first, once", () => {
    const results = parseSearch(
      { search: { nodes: [repo("x/zed"), repo("zed-industries/zed"), {}] } },
      repo("zed-industries/zed"),
    );
    expect(results.map((choice) => choice.slug)).toEqual(["zed-industries/zed", "x/zed"]);
  });

  it("builds the GitHub query", () => {
    expect(searchText("zed", "stars")).toBe("zed in:name archived:false sort:stars");
    expect(searchText("zed-industries/zed", "match")).toBe("zed in:name archived:false");
  });
});

describe("parseTypedRepo", () => {
  it("reads owner/name", () =>
    expect(parseTypedRepo("acme/web")).toEqual({ owner: "acme", name: "web", branch: undefined }));
  it("reads a branch after a colon", () =>
    expect(parseTypedRepo("acme/web:develop")).toEqual({ owner: "acme", name: "web", branch: "develop" }));
  it("reads a GitHub URL", () =>
    expect(parseTypedRepo("https://github.com/acme/web.git")).toMatchObject({ owner: "acme", name: "web" }));
  it("ignores plain words", () => expect(parseTypedRepo("web app")).toBeUndefined());
});
