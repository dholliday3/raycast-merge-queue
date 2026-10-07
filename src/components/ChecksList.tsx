import { Action, ActionPanel, Color, Icon, List, Keyboard } from "@raycast/api";
import { useEffect } from "react";
import { useMergeQueue, useSelection } from "../data";
import { Check, QueueEntry } from "../lib/queue";
import { checkDurationText, checkIcon, checkLabel, HEALTH_STYLE } from "./presentation";
import { JobDetail } from "./JobDetail";
import { confirmRerunFailedInRun, confirmRerunJob } from "./rerun";

const POLL_MS = 30_000;

function hasJob(check: Check): check is Check & { jobId: number } {
  return check.jobId !== undefined;
}

function CheckItem(props: { check: Check; entry: QueueEntry; revalidate: () => void }) {
  const { check, entry, revalidate } = props;
  const duration = checkDurationText(check);
  const accessories: List.Item.Accessory[] = [];
  if (check.required) {
    accessories.push({ tag: { value: "Required", color: Color.SecondaryText } });
  }
  if (duration) {
    accessories.push({ text: duration, icon: Icon.Clock });
  }

  return (
    <List.Item
      icon={{ value: checkIcon(check), tooltip: checkLabel(check) }}
      title={check.name}
      subtitle={check.workflow}
      keywords={check.workflow ? [check.workflow] : undefined}
      accessories={accessories}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {hasJob(check) ? (
              <Action.Push
                title="Show Steps and Log"
                icon={Icon.Document}
                target={<JobDetail check={check} pr={entry.pr} />}
              />
            ) : null}
            {check.url ? <Action.OpenInBrowser title="Open Check on GitHub" url={check.url} /> : null}
            <Action.OpenInBrowser
              title="Open Pull Request"
              url={entry.pr.url}
              shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            {hasJob(check) ? (
              <Action
                title="Rerun This Job"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd", "shift"], key: "j" }}
                onAction={() => confirmRerunJob(check, revalidate)}
              />
            ) : null}
            {check.state === "failure" && check.runId !== undefined ? (
              <Action
                title="Rerun Failed Jobs in Run"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
                onAction={() => confirmRerunFailedInRun(check, revalidate)}
              />
            ) : null}
            <Action.CopyToClipboard
              title="Copy Check Name"
              content={check.name}
              shortcut={Keyboard.Shortcut.Common.Copy}
            />
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={revalidate}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

export function ChecksList(props: { initialEntry: QueueEntry }) {
  const { selection } = useSelection();
  const { data, isLoading, revalidate } = useMergeQueue(selection);
  const live = data?.entries.find((entry) => entry.pr.number === props.initialEntry.pr.number);
  const entry = live ?? props.initialEntry;
  const leftQueue = Boolean(data) && !live;

  useEffect(() => {
    const timer = setInterval(revalidate, POLL_MS);
    return () => clearInterval(timer);
  }, [revalidate]);

  const sections: { title: string; checks: Check[] }[] = [
    { title: "Failing · Required", checks: entry.failingRequired },
    { title: "Failing · Optional", checks: entry.failingOptional },
    { title: "Running", checks: entry.checks.filter((check) => check.state === "pending") },
    { title: "Passed", checks: entry.checks.filter((check) => check.state === "success" || check.state === "neutral") },
    { title: "Skipped", checks: entry.checks.filter((check) => check.state === "skipped") },
  ];

  const emptyDescription =
    entry.health === "conflict"
      ? "No checks ran. GitHub couldn't build a merge group for this PR, usually because of a merge conflict."
      : "Checks haven't started for this entry yet.";

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`#${entry.pr.number} Checks${leftQueue ? " (left the queue)" : ""}`}
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
          <List.Section key={section.title} title={section.title} subtitle={String(section.checks.length)}>
            {section.checks.map((check) => (
              <CheckItem
                key={`${check.workflow ?? ""}/${check.name}/${check.jobId ?? ""}`}
                check={check}
                entry={entry}
                revalidate={revalidate}
              />
            ))}
          </List.Section>
        ))}
    </List>
  );
}
