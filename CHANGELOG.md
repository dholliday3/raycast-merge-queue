# Merge Queue Changelog

## [Initial Version] - {PR_MERGE_DATE}

- Merge Queue: every entry in order with its state, required-check progress, ETA, and failing checks; filter to yours or the ones that need attention
- Checks in two columns: only what's failing on the left, a preview of the selected failure on the right with errors linked to the file and line, failed and flaky tests, and the log around the error
- Links straight to the failing line of the log on GitHub
- Full report per job with the failed step, errors, tests and log; copy a failure summary with links to paste into chat
- Rerun failed jobs or a single job, with a confirmation first
- Merge Queue Menu Bar: your position and state, refreshed every minute
- Remembers your repository and opens straight to its queue; picks it for you the first time when there's only one likely queue
- Switch repositories from the search bar dropdown or the full picker
- Pick a repository in the command: your queued pull requests' repositories and your active ones with a merge queue come first, or search all of GitHub by recent pushes, stars, or best match
- Detects the queue's branch from the default branch, rulesets, or your queued pull requests
- Reads through the GitHub CLI, with nothing to configure
- Plain-language errors with a fix for each: install or sign in to gh, a repository you can't see, one without a merge queue (choose another or enter its branch), offline, and rate limits
