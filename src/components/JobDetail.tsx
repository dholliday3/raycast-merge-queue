import { Action, ActionPanel, Color, Detail, Icon, Keyboard } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { loadJob, loadLogSummary } from "../data";
import { logErrorMessage } from "../lib/errors";
import { formatSeconds, secondsBetween } from "../lib/format";
import { jobState } from "../lib/jobs";
import { Check, PullRequestSummary } from "../lib/queue";
import { buildCopyText, buildJobMarkdown, JobReportInput, LogState } from "../lib/report";
import { checkLabel } from "./presentation";
import { confirmRerunFailedInRun, confirmRerunJob } from "./rerun";

function statusColor(check: Check): Color {
  switch (check.state) {
    case "failure":
      return check.required ? Color.Red : Color.Orange;
    case "pending":
      return Color.Yellow;
    case "success":
      return Color.Green;
    default:
      return Color.SecondaryText;
  }
}

export function JobDetail(props: { check: Check & { jobId: number }; pr?: PullRequestSummary }) {
  const { pr } = props;
  const jobId = props.check.jobId;
  const details = useCachedPromise(loadJob, [jobId]);
  const job = details.data?.job;
  const check: Check = job
    ? { ...props.check, state: jobState(job), conclusion: job.conclusion ?? job.status }
    : props.check;
  const jobFinished = job?.status === "completed";

  const [wantLog, setWantLog] = useState(props.check.state === "failure");
  const log = useCachedPromise(loadLogSummary, [jobId], { execute: wantLog && jobFinished });

  let logState: LogState;
  if (log.error) {
    logState = { status: "error", message: logErrorMessage(log.error) };
  } else if (log.data) {
    logState = { status: "loaded", summary: log.data };
  } else if (job && !jobFinished) {
    logState = { status: "unavailable", reason: "The job is still running. Its log is available once it finishes." };
  } else if (wantLog) {
    logState = { status: "loading" };
  } else {
    logState = { status: "idle" };
  }

  const input: JobReportInput = { check, pr, job, annotations: details.data?.annotations, log: logState };
  const runtime = job ? secondsBetween(job.startedAt, job.completedAt ?? new Date()) : undefined;
  const url = job?.htmlUrl ?? check.url;

  return (
    <Detail
      isLoading={details.isLoading || log.isLoading}
      navigationTitle={check.name}
      markdown={buildJobMarkdown(input)}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Status">
            <Detail.Metadata.TagList.Item text={checkLabel(check)} color={statusColor(check)} />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Label title="Required" text={check.required ? "Yes, blocks the merge" : "No"} />
          {check.workflow ? <Detail.Metadata.Label title="Workflow" text={check.workflow} /> : null}
          {job ? (
            <Detail.Metadata.Link title="Run" text={`${job.runId} · attempt ${job.runAttempt}`} target={job.runUrl} />
          ) : null}
          {runtime !== undefined ? <Detail.Metadata.Label title="Duration" text={formatSeconds(runtime)} /> : null}
          {job?.runnerName ? <Detail.Metadata.Label title="Runner" text={job.runnerName} /> : null}
          {pr ? <Detail.Metadata.Separator /> : null}
          {pr ? <Detail.Metadata.Link title="Pull Request" text={`#${pr.number}`} target={pr.url} /> : null}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {url ? <Action.OpenInBrowser title="Open Job on GitHub" url={url} /> : null}
            <Action.CopyToClipboard
              title="Copy Failure Summary"
              content={buildCopyText(input)}
              shortcut={Keyboard.Shortcut.Common.Copy}
            />
            {logState.status === "loaded" ? (
              <Action.CopyToClipboard
                title="Copy Log Excerpt"
                content={logState.summary.excerpt.join("\n")}
                shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
              />
            ) : null}
            {!wantLog ? (
              <Action
                title="Load Log"
                icon={Icon.Document}
                shortcut={{ modifiers: ["cmd"], key: "l" }}
                onAction={() => setWantLog(true)}
              />
            ) : null}
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="Rerun This Job"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["cmd", "shift"], key: "j" }}
              onAction={() => confirmRerunJob(check, details.revalidate)}
            />
            {check.runId !== undefined ? (
              <Action
                title="Rerun Failed Jobs in Run"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
                onAction={() => confirmRerunFailedInRun(check, details.revalidate)}
              />
            ) : null}
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={() => {
                details.revalidate();
                if (wantLog && jobFinished) {
                  log.revalidate();
                }
              }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
