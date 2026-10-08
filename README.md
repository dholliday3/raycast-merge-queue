# Merge Queue

See a GitHub merge queue from Raycast: where your pull request sits, what's running, and what's failing, with drill-down into each job's steps and log.

## Commands

**Merge Queue** asks for a repository the first time, then lists every entry in the queue, in order, with its state:

- **Merging**: the entry at the front that GitHub is landing now
- **Running checks**: with how many required checks have finished
- **Checks failed**: a required check failed, named in the row
- **Merge conflict**: GitHub couldn't build a merge group, so no checks ran
- **Waiting to build** / **Ready to merge**

Optional checks that fail are shown in orange and don't count against the entry. Filter to **Mine** or **Needs Attention** from the dropdown. `↵` opens an entry's checks, grouped into failing (required, then optional), running, passed and skipped. `↵` on a check opens its job: the steps, the failing step in bold, key errors from annotations and the log, failed and flaky tests (Playwright and Vitest), and a log excerpt from where it failed.

**Merge Queue Menu Bar** shows your position (`#3 · 14m`) with an icon for your worst entry's state, refreshing every minute. Each entry has a submenu with its failing checks and a rerun action.

## Setup

Install and sign in to the [GitHub CLI](https://cli.github.com): `brew install gh && gh auth login`. That's all; there's nothing to fill in.

## Choosing a Repository

Most people watch one queue, so the extension remembers yours and opens straight to it. The first time, if you have a pull request queued in exactly one repository, or only one of your repositories has a merge queue, it picks that one for you. Otherwise it lists repositories to choose from:

- **Your Queued Pull Requests**: repositories where one of your pull requests is in a merge queue right now
- **Merge Queue On**: your most recently pushed repositories, and ones you've contributed to, that have a merge queue
- **Your Other Repositories**: the rest, for a queue the extension couldn't detect

To switch, use the **Repository** section of the dropdown next to the search bar (`⌘P`), which lists the current repository, recent ones and your other repositories with a merge queue, or press `⇧⌘P` for the full list. Type to search all of GitHub, sorted by recent pushes, stars, or best match. Type `owner/name` to go straight to a repository, or `owner/name:branch` for a queue on a branch the extension can't detect.

A queue is detected on the default branch, on a branch named in a ruleset with a merge queue rule, or on the base branch of your queued pull requests. **GitHub CLI Path** is found automatically in `/opt/homebrew/bin`, `/usr/local/bin` or `/usr/bin`; set it in preferences if `gh` lives somewhere else.

The extension reads through `gh`, so it sees exactly what your `gh` account can see. Each refresh is one GraphQL query. Required checks come from the branch's rulesets and branch protection (read access is enough) and are cached for an hour. Job logs are only fetched when you open a failed job, or press `⌘L` on another one.

## Shortcuts

| Key   | Action                                                               |
| ----- | -------------------------------------------------------------------- |
| `↵`   | Show checks / show a job's steps and log                             |
| `⇧⌘F` | Show the entry's failing job                                         |
| `⇧⌘R` | Rerun failed jobs (asks first)                                       |
| `⇧⌘J` | Rerun this job (asks first)                                          |
| `⇧⌘C` | Copy the PR URL, check name, or a failure summary to paste into chat |
| `⇧⌘E` | Copy the log excerpt                                                 |
| `⇧⌘B` | Copy the branch name                                                 |
| `⇧⌘G` | Open the merge queue on GitHub                                       |
| `⌘L`  | Load the log of a job that didn't fail                               |
| `⌘R`  | Refresh                                                              |
| `⇧⌘P` | Switch repository                                                    |

## Development

```bash
npm install
npm run dev    # loads it into Raycast
npm test
```

Screenshots use made-up data: `raycast://extensions/dholliday/merge-queue/merge-queue?launchContext=%7B%22demo%22%3Atrue%7D`
