# Merge Queue Changelog

## [Initial Version] - {PR_MERGE_DATE}

- Merge Queue: every entry in order with its state, required-check progress, ETA, and failing checks; filter to yours or the ones that need attention
- Checks view per entry, grouped into failing (required, then optional), running, passed and skipped
- Job view with steps, key errors, failed and flaky tests, and a log excerpt from where it failed; copy a failure summary to paste into chat
- Rerun failed jobs or a single job, with a confirmation first
- Merge Queue Menu Bar: your position and state, refreshed every minute
- Reads through the GitHub CLI; uses the repository's default branch unless you pick one
