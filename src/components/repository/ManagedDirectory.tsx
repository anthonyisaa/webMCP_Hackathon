import {
  MANAGED_AGENT_HANDLES,
  relayAccessProfileForManagedHandle,
  type DirectoryEntry,
  type ManagedAgentDirectoryEntry,
  type ManagedAgentHandle,
  type RelayAccessProfile,
} from "@/agent-relay/contracts";

import styles from "./repository-workspace.module.css";

export interface ManagedDirectoryProps {
  directory: readonly DirectoryEntry[];
  activeProfileId?: string | null;
  onChoose?: (entry: DirectoryEntry) => void;
  query?: string;
  showHumans?: boolean;
}

const EXPERTISE_COPY: Readonly<Record<ManagedAgentDirectoryEntry["expertise"], string>> = {
  DATA: "Data analysis expertise",
  CODE: "Software analysis expertise",
  GENERAL: "Generalist expertise",
};

const ACCESS_COPY: Readonly<Record<RelayAccessProfile, string>> = {
  METRICS_SCOPED_EDIT: "Metrics tools",
  REPOSITORY_SCOPED_EDIT: "Repository tools",
  EDITORIAL_SCOPED_EDIT: "Editorial tools",
};

function isManagedHandle(value: string): value is ManagedAgentHandle {
  return MANAGED_AGENT_HANDLES.some((handle) => handle === value);
}

function managedAccessCopy(entry: ManagedAgentDirectoryEntry): string {
  return isManagedHandle(entry.handle)
    ? ACCESS_COPY[relayAccessProfileForManagedHandle(entry.handle)]
    : "Company tools";
}

function initials(value: string): string {
  return value.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function matches(entry: DirectoryEntry, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return entry.displayName.toLocaleLowerCase().includes(normalized)
    || entry.handle.toLocaleLowerCase().includes(normalized);
}

export function ManagedDirectory({ directory, activeProfileId = null, onChoose, query = "", showHumans = true }: ManagedDirectoryProps) {
  const agents = directory
    .filter((entry): entry is ManagedAgentDirectoryEntry => entry.kind === "AGENT" && entry.identitySource === "DEMO_DIRECTORY")
    .filter((entry) => matches(entry, query));
  const humans = directory.filter((entry) => entry.kind === "HUMAN").filter((entry) => matches(entry, query));

  const item = (entry: DirectoryEntry) => {
    const content = (
      <>
        <span className={styles.directoryAvatar} data-expertise={entry.kind === "AGENT" ? entry.expertise.toLowerCase() : "human"}>{initials(entry.displayName)}</span>
        <span className={styles.directoryIdentity}>
          <strong>@{entry.displayName}</strong>
          <small>{entry.kind === "AGENT"
            ? `${EXPERTISE_COPY[entry.expertise]} · ${entry.identitySource === "DEMO_DIRECTORY" ? managedAccessCopy(entry) : "Connected tools"}`
            : "Collaborator · discussion only"}</small>
        </span>
        {entry.kind === "AGENT" && entry.identitySource === "DEMO_DIRECTORY" ? <span className={styles.directoryScope}>Company-set</span> : null}
      </>
    );
    return onChoose ? (
      <button
        type="button"
        role="option"
        aria-selected={entry.kind === "AGENT" && entry.profileId === activeProfileId}
        key={`${entry.kind}:${entry.kind === "AGENT" ? entry.profileId : entry.member.memberId}`}
        onClick={() => onChoose(entry)}
      >{content}</button>
    ) : (
      <div key={`${entry.kind}:${entry.kind === "AGENT" ? entry.profileId : entry.member.memberId}`}>{content}</div>
    );
  };

  return (
    <div className={styles.managedDirectory} data-testid="managed-agent-directory">
      <section aria-label="Managed bots">
        <header><span>Managed bots</span><small>Tools set by company</small></header>
        <div>{agents.length ? agents.map(item) : <p>No matching managed agent.</p>}</div>
      </section>
      {showHumans && humans.length ? (
        <section aria-label="People">
          <header><span>People</span><small>Comments only</small></header>
          <div>{humans.map(item)}</div>
        </section>
      ) : null}
    </div>
  );
}
