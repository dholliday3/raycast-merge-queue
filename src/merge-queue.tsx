import {
  Action,
  ActionPanel,
  Icon,
  Keyboard,
  LaunchProps,
  List,
  openExtensionPreferences,
  useNavigation,
} from "@raycast/api";
import { ReactElement, useEffect, useState } from "react";
import { ChecksList } from "./components/ChecksList";
import { JobDetail } from "./components/JobDetail";
import { entryAccessories, entryIcon, entryStatusText } from "./components/presentation";
import { RepoPicker, SwitchRepository } from "./components/RepoPicker";
import { confirmRerunFailedForEntry } from "./components/rerun";
import { enableDemo, MergeQueueLaunchContext, useMergeQueue, useRepoChoices, useSelection } from "./data";
import { ordinal } from "./lib/format";
import { setupCommand } from "./lib/gh";
import { failingRunIds, primaryFailingJob, QueueEntry, QueueSnapshot } from "./lib/queue";
import { RepoSelection, sameRepo, selectionKey, switchTargets } from "./lib/repos";

type Filter = "all" | "mine" | "attention";

const CHOOSE_REPOSITORY = "choose";

const POLL_MS = 30_000;

function needsAttention(entry: QueueEntry): boolean {
  return entry.health === "failing" || entry.health === "conflict";
}

function matchesFilter(entry: QueueEntry, filter: Filter): boolean {
  if (filter === "mine") {
    return entry.isMine;
  }
  if (filter === "attention") {
    return needsAttention(entry);
  }
  return true;
}

function sectionSubtitle(snapshot: QueueSnapshot): string {
  const attention = snapshot.entries.filter(needsAttention).length;
  const mine = snapshot.entries.find((entry) => entry.isMine);
  return [
    `${snapshot.entries.length} queued`,
    mine ? `you're ${ordinal(mine.position)}` : undefined,
    attention ? `${attention} need attention` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function emptyTitle(filter: Filter): string {
  switch (filter) {
    case "mine":
      return "None of your pull requests are queued";
    case "attention":
      return "Nothing in the queue needs attention";
    default:
      return "The merge queue is empty";
  }
}

function isSnapshotOf(snapshot: QueueSnapshot | undefined, selection: RepoSelection | undefined) {
  return Boolean(
    snapshot && selection && snapshot.repo.toLowerCase() === `${selection.owner}/${selection.name}`.toLowerCase(),
  );
}

function EntryItem(props: {
  entry: QueueEntry;
  snapshot: QueueSnapshot;
  revalidate: () => void;
  switchAction: ReactElement;
}) {
  const { entry, snapshot, revalidate, switchAction } = props;
  const failingJob = primaryFailingJob(entry);
  const canRerun = failingRunIds(entry).length > 0;

  return (
    <List.Item
      id={String(entry.pr.number)}
      icon={{ value: entryIcon(entry), tooltip: entryStatusText(entry) }}
      title={entry.pr.title}
      subtitle={`#${entry.pr.number}`}
      keywords={[String(entry.pr.number), entry.pr.author, entry.pr.branch]}
      accessories={entryAccessories(entry)}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.Push title="Show Checks" icon={Icon.List} target={<ChecksList initialEntry={entry} />} />
            <Action.OpenInBrowser title="Open Pull Request" url={entry.pr.url} />
            {failingJob?.jobId !== undefined ? (
              <Action.Push
                title={`Show ${failingJob.name} Failure`}
                icon={Icon.XMarkCircle}
                shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
                target={<JobDetail check={{ ...failingJob, jobId: failingJob.jobId }} pr={entry.pr} />}
              />
            ) : null}
          </ActionPanel.Section>
          <ActionPanel.Section>
            {canRerun ? (
              <Action
                title="Rerun Failed Jobs"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
                onAction={() => confirmRerunFailedForEntry(entry, revalidate)}
              />
            ) : null}
            <Action.CopyToClipboard
              title="Copy Pull Request URL"
              content={entry.pr.url}
              shortcut={Keyboard.Shortcut.Common.Copy}
            />
            <Action.CopyToClipboard
              title="Copy Branch Name"
              content={entry.pr.branch}
              shortcut={{ modifiers: ["cmd", "shift"], key: "b" }}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={revalidate}
            />
            <Action.OpenInBrowser
              title="Open Merge Queue on GitHub"
              url={snapshot.url}
              shortcut={{ modifiers: ["cmd", "shift"], key: "g" }}
            />
            {switchAction}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

export default function Command(props: LaunchProps<{ launchContext: MergeQueueLaunchContext }>) {
  enableDemo(props.launchContext?.demo);
  const { selection, recents, setSelection, isLoading: selectionLoading } = useSelection();
  const cachedChoices = useRepoChoices({ execute: false });
  const { push } = useNavigation();
  const [dropdownKey, setDropdownKey] = useState(0);
  const queue = useMergeQueue(selection);
  const { error, isLoading, revalidate } = queue;
  const data = isSnapshotOf(queue.data, selection) ? queue.data : undefined;
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string>();
  const context = props.launchContext;

  useEffect(() => {
    const timer = setInterval(revalidate, POLL_MS);
    return () => clearInterval(timer);
  }, [revalidate]);

  useEffect(() => {
    if (selectedId || !data) {
      return;
    }
    const target = context?.prNumber ?? data.entries.find((entry) => entry.isMine)?.pr.number;
    if (target !== undefined) {
      setSelectedId(String(target));
    }
  }, [data, selectedId, context?.prNumber]);

  useEffect(() => setSelectedId(undefined), [selection?.owner, selection?.name, selection?.branch]);

  if (!selection) {
    return selectionLoading ? <List isLoading /> : <RepoPicker autoPick onPick={setSelection} />;
  }

  const switchAction = (
    <Action.Push
      title="Switch Repository"
      icon={Icon.Switch}
      shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
      target={<SwitchRepository current={selection} onPick={setSelection} />}
    />
  );

  const launchedEntry =
    context?.view === "checks" ? data?.entries.find((entry) => entry.pr.number === context.prNumber) : undefined;
  if (launchedEntry) {
    return <ChecksList initialEntry={launchedEntry} />;
  }

  const entries = (data?.entries ?? []).filter((entry) => matchesFilter(entry, filter));
  const repoTargets = switchTargets(selection, recents, cachedChoices.data ?? []);
  const command = setupCommand(error);

  return (
    <List
      isLoading={isLoading || (!data && !error)}
      searchBarPlaceholder="Filter by title, number, author, or branch"
      selectedItemId={selectedId}
      onSelectionChange={(id) => {
        if (id) {
          setSelectedId(id);
        }
      }}
      searchBarAccessory={
        <List.Dropdown
          key={dropdownKey}
          tooltip="Show or Switch Repository"
          value={`filter:${filter}`}
          onChange={(value) => {
            if (value.startsWith("filter:")) {
              setFilter(value.slice("filter:".length) as Filter);
              return;
            }
            setDropdownKey((key) => key + 1);
            if (value === CHOOSE_REPOSITORY) {
              push(<SwitchRepository current={selection} onPick={setSelection} />);
              return;
            }
            const target = repoTargets.find((candidate) => `repo:${selectionKey(candidate)}` === value);
            if (target && !sameRepo(target, selection)) {
              setFilter("all");
              setSelection(target);
            }
          }}
        >
          <List.Dropdown.Section title="Show">
            <List.Dropdown.Item title="Whole Queue" value="filter:all" icon={Icon.List} />
            <List.Dropdown.Item title="Mine" value="filter:mine" icon={Icon.Person} />
            <List.Dropdown.Item title="Needs Attention" value="filter:attention" icon={Icon.XMarkCircle} />
          </List.Dropdown.Section>
          <List.Dropdown.Section title="Repository">
            {repoTargets.map((target) => (
              <List.Dropdown.Item
                key={selectionKey(target)}
                title={`${target.owner}/${target.name}${target.branch ? ` · ${target.branch}` : ""}`}
                value={`repo:${selectionKey(target)}`}
                icon={sameRepo(target, selection) ? Icon.CheckCircle : Icon.Circle}
              />
            ))}
            <List.Dropdown.Item
              title="Choose Another Repository…"
              value={CHOOSE_REPOSITORY}
              icon={Icon.MagnifyingGlass}
            />
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {error && !data ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Couldn't load the merge queue"
          description={
            command ? `${error.message}\n\nCopy the setup command (↵) and run it in a terminal.` : error.message
          }
          actions={
            <ActionPanel>
              {command ? (
                <Action.CopyToClipboard title="Copy Setup Command" content={command} icon={Icon.Terminal} />
              ) : null}
              <Action title="Retry" icon={Icon.ArrowClockwise} onAction={revalidate} />
              {switchAction}
              <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
            </ActionPanel>
          }
        />
      ) : null}
      {data && entries.length === 0 ? (
        <List.EmptyView
          icon={Icon.CheckCircle}
          title={emptyTitle(filter)}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Open Merge Queue on GitHub" url={data.url} />
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={revalidate} />
              {switchAction}
            </ActionPanel>
          }
        />
      ) : null}
      {data ? (
        <List.Section title={`${data.repo} · ${data.branch}`} subtitle={sectionSubtitle(data)}>
          {entries.map((entry) => (
            <EntryItem
              key={entry.id}
              entry={entry}
              snapshot={data}
              revalidate={revalidate}
              switchAction={switchAction}
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}
