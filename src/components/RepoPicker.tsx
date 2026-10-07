import {
  Action,
  ActionPanel,
  Color,
  Icon,
  Image,
  Keyboard,
  List,
  openExtensionPreferences,
  useNavigation,
} from "@raycast/api";
import { useState } from "react";
import { selectionFor, useRepoChoices, useRepoSearch } from "../data";
import { formatAgo } from "../lib/format";
import { setupCommand } from "../lib/gh";
import { groupChoices, parseTypedRepo, RepoChoice, RepoSelection, RepoSort } from "../lib/repos";

function queueText(choice: RepoChoice): string | undefined {
  if (choice.yourQueued > 0) {
    return `${choice.yourQueued} of yours queued`;
  }
  return choice.queued !== undefined ? `${choice.queued} queued` : undefined;
}

function accessories(choice: RepoChoice): List.Item.Accessory[] {
  const items: List.Item.Accessory[] = [];
  const queued = queueText(choice);
  if (choice.queueBranch === undefined) {
    items.push({ tag: { value: "No merge queue", color: Color.SecondaryText } });
  } else if (queued) {
    items.push({ tag: { value: queued, color: choice.yourQueued > 0 ? Color.Blue : Color.Green } });
  }
  if (choice.stars > 0) {
    items.push({ text: choice.stars.toLocaleString("en-US"), icon: Icon.Star, tooltip: "Stars" });
  }
  if (choice.pushedAt) {
    items.push({ text: formatAgo(choice.pushedAt), tooltip: "Last push" });
  }
  return items;
}

function RepoItem(props: { choice: RepoChoice; current?: RepoSelection; onPick: (selection: RepoSelection) => void }) {
  const { choice, current, onPick } = props;
  const isCurrent = current?.owner === choice.owner && current?.name === choice.name;
  const branchNote =
    choice.queueBranch && choice.queueBranch !== choice.defaultBranch ? `queue on ${choice.queueBranch}` : undefined;
  return (
    <List.Item
      icon={choice.avatarUrl ? { source: choice.avatarUrl, mask: Image.Mask.RoundedRectangle } : Icon.Box}
      title={choice.slug}
      subtitle={[isCurrent ? "current" : undefined, branchNote, choice.isPrivate ? "private" : undefined]
        .filter(Boolean)
        .join(" · ")}
      accessories={accessories(choice)}
      actions={
        <ActionPanel>
          <Action title="Use Repository" icon={Icon.CheckCircle} onAction={() => onPick(selectionFor(choice))} />
          <Action.OpenInBrowser
            title="Open on GitHub"
            url={`https://github.com/${choice.slug}`}
            shortcut={Keyboard.Shortcut.Common.Open}
          />
          <Action.CopyToClipboard
            title="Copy Repository Name"
            content={choice.slug}
            shortcut={Keyboard.Shortcut.Common.Copy}
          />
        </ActionPanel>
      }
    />
  );
}

function Sections(props: {
  choices: RepoChoice[];
  sort: RepoSort;
  current?: RepoSelection;
  onPick: (selection: RepoSelection) => void;
  othersTitle: string;
}) {
  const groups = groupChoices(props.choices, props.sort);
  const sections = [
    { title: "Your Queued Pull Requests", choices: groups.yours },
    { title: "Merge Queue On", choices: groups.withQueue },
    { title: props.othersTitle, choices: groups.others },
  ];
  return (
    <>
      {sections
        .filter((section) => section.choices.length > 0)
        .map((section) => (
          <List.Section key={section.title} title={section.title} subtitle={String(section.choices.length)}>
            {section.choices.map((choice) => (
              <RepoItem key={choice.slug} choice={choice} current={props.current} onPick={props.onPick} />
            ))}
          </List.Section>
        ))}
    </>
  );
}

export function RepoPicker(props: { current?: RepoSelection; onPick: (selection: RepoSelection) => void }) {
  const [text, setText] = useState("");
  const [sort, setSort] = useState<RepoSort>("pushed");
  const searching = text.trim().length >= 2;
  const choices = useRepoChoices();
  const search = useRepoSearch(text, sort);
  const typed = parseTypedRepo(text);
  const error = searching ? search.error : choices.error;
  const command = setupCommand(error);
  const needle = text.trim().toLowerCase();
  const yours = (choices.data ?? []).filter((choice) => choice.slug.toLowerCase().includes(needle));
  const shown = searching && search.data ? search.data : yours;

  return (
    <List
      isLoading={searching ? search.isLoading : choices.isLoading}
      filtering={false}
      onSearchTextChange={setText}
      throttle
      searchBarPlaceholder="Search GitHub repositories, or type owner/name"
      searchBarAccessory={
        <List.Dropdown tooltip="Sort" value={sort} onChange={(value) => setSort(value as RepoSort)}>
          <List.Dropdown.Item title="Recently Pushed" value="pushed" icon={Icon.Clock} />
          <List.Dropdown.Item title="Most Stars" value="stars" icon={Icon.Star} />
          <List.Dropdown.Item title="Best Match" value="match" icon={Icon.MagnifyingGlass} />
        </List.Dropdown>
      }
    >
      {error && shown.length === 0 ? (
        <List.EmptyView
          icon={Icon.Warning}
          title={searching ? "Couldn't search GitHub" : "Couldn't list your repositories"}
          description={
            command ? `${error.message}\n\nCopy the setup command (↵) and run it in a terminal.` : error.message
          }
          actions={
            <ActionPanel>
              {command ? (
                <Action.CopyToClipboard title="Copy Setup Command" content={command} icon={Icon.Terminal} />
              ) : null}
              <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
            </ActionPanel>
          }
        />
      ) : (searching ? search.isLoading : choices.isLoading) ? null : (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title={searching ? "No repositories found" : "Search for a repository"}
          description="Type a name to search GitHub, or owner/name to go straight to one."
        />
      )}
      {typed?.branch ? (
        <List.Section title="Typed">
          <List.Item
            icon={Icon.Code}
            title={`${typed.owner}/${typed.name}`}
            subtitle={`queue on ${typed.branch}`}
            actions={
              <ActionPanel>
                <Action title="Use Repository" icon={Icon.CheckCircle} onAction={() => props.onPick(typed)} />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}
      <Sections
        choices={shown}
        sort={sort}
        current={props.current}
        onPick={props.onPick}
        othersTitle={searching ? "Other Results" : "Your Other Repositories"}
      />
    </List>
  );
}

export function SwitchRepository(props: { current?: RepoSelection; onPick: (selection: RepoSelection) => void }) {
  const { pop } = useNavigation();
  return (
    <RepoPicker
      current={props.current}
      onPick={(selection) => {
        props.onPick(selection);
        pop();
      }}
    />
  );
}
