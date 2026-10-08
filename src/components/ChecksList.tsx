import { Action, ActionPanel, Color, Icon, Keyboard, List } from "@raycast/api";
import { useEffect, useState } from "react";
import { useMergeQueue, useSelection } from "../data";
import { truncate } from "../lib/format";
import { Check, QueueEntry } from "../lib/queue";
import { buildCopyText, buildPreviewMarkdown } from "../lib/report";
import { ListMetadata, metadataRows, useJobReport } from "./failure";
import { JobDetail } from "./JobDetail";
import { checkIcon, checkLabel, HEALTH_STYLE } from "./presentation";
import { confirmRerunFailedInRun, confirmRerunJob } from "./rerun";

const POLL_MS = 30_000;

type ViewActions = { showAll: boolean; toggleShowAll: () => void; revalidate: () => void };

function ViewSection(props: { entry: QueueEntry; view: ViewActions }) {
  const { entry, view } = props;
  return (
    <ActionPanel.Section>
      <Action.OpenInBrowser
        title="Open Pull Request"
        url={entry.pr.url}
        shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
      />
      <Action
        title={view.showAll ? "Show Failures Only" : "Show All Checks"}
        icon={view.showAll ? Icon.XMarkCircle : Icon.List}
        shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
        onAction={view.toggleShowAll}
      />
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={view.revalidate}
      />
    </ActionPanel.Section>
  );
}

function CheckItem(props: { check: Check; entry: QueueEntry; repo: string; view: ViewActions }) {
  const { check, entry, repo, view } = props;
  const failing = check.state === "failure";
  const report = useJobReport({
    check,
    pr: entry.pr,
    repo,
    sha: entry.headSha,
    enabled: failing,
    wantLog: failing,
  });
  const { input, failureUrl } = report;
  const jobId = check.jobId;

  return (
    <List.Item
      icon={{ value: checkIcon(check), tooltip: `${checkLabel(check)}${check.required ? "" : " · optional"}` }}
      title={check.name}
      keywords={check.workflow ? [check.workflow] : undefined}
      detail={
        <List.Item.Detail
          isLoading={report.isLoading}
          markdown={buildPreviewMarkdown(input)}
          metadata={<ListMetadata rows={metadataRows(input, failureUrl)} />}
        />
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {jobId !== undefined ? (
              <Action.Push
                title="Show Details"
                icon={Icon.Sidebar}
                target={<JobDetail check={{ ...check, jobId }} pr={entry.pr} repo={repo} sha={entry.headSha} />}
              />
            ) : null}
            {failureUrl ? (
              <Action.OpenInBrowser title={failing ? "Open Failure on GitHub" : "Open on GitHub"} url={failureUrl} />
            ) : null}
            {failing ? (
              <Action.CopyToClipboard
                title="Copy Failure Summary"
                content={buildCopyText(input)}
                shortcut={Keyboard.Shortcut.Common.Copy}
              />
            ) : null}
            {input.log.status === "loaded" && input.log.summary.excerpt.length > 0 ? (
              <Action.CopyToClipboard
                title="Copy Log Excerpt"
                content={input.log.summary.excerpt.join("\n")}
                shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
              />
            ) : null}
          </ActionPanel.Section>
          <ActionPanel.Section>
            {jobId !== undefined ? (
              <Action
                title="Rerun This Job"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd", "shift"], key: "j" }}
                onAction={() => confirmRerunJob(check, view.revalidate)}
              />
            ) : null}
            {failing && check.runId !== undefined ? (
              <Action
                title="Rerun Failed Jobs in Run"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
                onAction={() => confirmRerunFailedInRun(check, view.revalidate)}
              />
            ) : null}
          </ActionPanel.Section>
          <ViewSection entry={entry} view={view} />
        </ActionPanel>
      }
    />
  );
}

function hiddenSummary(hidden: Check[]): string {
  const count = (state: Check["state"]) => hidden.filter((check) => check.state === state).length;
  const passed = count("success") + count("neutral");
  return [
    passed ? `${passed} passed` : undefined,
    count("pending") ? `${count("pending")} running` : undefined,
    count("skipped") ? `${count("skipped")} skipped` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ChecksList(props: { initialEntry: QueueEntry }) {
  const { selection } = useSelection();
  const { data, isLoading, revalidate } = useMergeQueue(selection);
  const live = data?.entries.find((entry) => entry.pr.number === props.initialEntry.pr.number);
  const entry = live ?? props.initialEntry;
  const leftQueue = Boolean(data) && !live;
  const repo = data?.repo ?? (selection ? `${selection.owner}/${selection.name}` : "");
  const [showAll, setShowAll] = useState(false);
  const view: ViewActions = { showAll, toggleShowAll: () => setShowAll((value) => !value), revalidate };

  useEffect(() => {
    const timer = setInterval(revalidate, POLL_MS);
    return () => clearInterval(timer);
  }, [revalidate]);

  const failing = [...entry.failingRequired, ...entry.failingOptional];
  const running = entry.checks.filter((check) => check.state === "pending");
  const focused = failing.length > 0 ? failing : running;
  const hidden = entry.checks.filter((check) => !focused.includes(check));
  const sections: { title: string; checks: Check[] }[] = showAll
    ? [
        { title: "Failing", checks: failing },
        { title: "Running", checks: running },
        {
          title: "Passed",
          checks: entry.checks.filter((check) => check.state === "success" || check.state === "neutral"),
        },
        { title: "Skipped", checks: entry.checks.filter((check) => check.state === "skipped") },
      ]
    : [{ title: failing.length > 0 ? "Failing" : "Running", checks: focused }];

  const emptyDescription =
    entry.health === "conflict"
      ? "No checks ran. GitHub couldn't build a merge group for this PR, usually because of a merge conflict."
      : "Checks haven't started for this entry yet.";

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={entry.checks.length > 0}
      navigationTitle={`#${entry.pr.number} · ${truncate(entry.pr.title, 48)}${leftQueue ? " · left the queue" : ""}`}
      searchBarPlaceholder={`Filter ${entry.checks.length} checks`}
    >
      {entry.checks.length === 0 ? (
        <List.EmptyView
          icon={{ source: HEALTH_STYLE[entry.health].icon, tintColor: HEALTH_STYLE[entry.health].color }}
          title={HEALTH_STYLE[entry.health].label}
          description={emptyDescription}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Open Pull Request" url={entry.pr.url} />
            </ActionPanel>
          }
        />
      ) : null}
      {sections
        .filter((section) => section.checks.length > 0)
        .map((section) => (
          <List.Section key={section.title} title={section.title}>
            {section.checks.map((check) => (
              <CheckItem
                key={`${check.workflow ?? ""}/${check.name}/${check.jobId ?? ""}`}
                check={check}
                entry={entry}
                repo={repo}
                view={view}
              />
            ))}
          </List.Section>
        ))}
      {!showAll && hidden.length > 0 ? (
        <List.Section>
          <List.Item
            icon={{ source: focused.length > 0 ? Icon.Ellipsis : Icon.CheckCircle, tintColor: Color.SecondaryText }}
            title={focused.length > 0 ? hiddenSummary(hidden) : `All ${hidden.length} checks finished`}
            subtitle={focused.length > 0 ? "hidden" : hiddenSummary(hidden)}
            detail={
              <List.Item.Detail
                markdown={
                  focused.length > 0
                    ? "_Hidden to keep the failures in focus. Press ↵ to show every check._"
                    : "_Nothing is failing or running. Press ↵ to show every check._"
                }
              />
            }
            actions={
              <ActionPanel>
                <Action title="Show All Checks" icon={Icon.List} onAction={view.toggleShowAll} />
                <ViewSection entry={entry} view={view} />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}
    </List>
  );
}
