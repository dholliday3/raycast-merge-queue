# Merge Queue Changelog

## [Initial Version] - {PR_MERGE_DATE}

- Merge Queue: every entry in order with its state, required-check progress, ETA, and failing checks; filter to yours or the ones that need attention
- Checks view per entry, grouped into failing (required, then optional), running, passed and skipped
- Job view with steps, key errors, failed and flaky tests, and a log excerpt from where it failed; copy a failure summary to paste into chat
- Rerun failed jobs or a single job, with a confirmation first
- Merge Queue Menu Bar: your position and state, refreshed every minute
- Pick a repository in the command: your queued pull requests' repositories and your active ones with a merge queue come first, or search all of GitHub by recent pushes, stars, or best match
- Detects the queue's branch from the default branch, rulesets, or your queued pull requests
- Reads through the GitHub CLI, with nothing to configure
