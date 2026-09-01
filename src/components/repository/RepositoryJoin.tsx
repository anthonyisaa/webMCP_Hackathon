"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

import styles from "./repository-landing.module.css";

export interface RepositoryJoinProps {
  busy: boolean;
  error?: string | null;
  onJoin: (displayName: string) => void;
}

function clampDisplayName(value: string): string {
  return Array.from(value).slice(0, 80).join("");
}

/** Account-free identity gate for a person arriving through a clean share URL. */
export function RepositoryJoin({ busy, error = null, onJoin }: RepositoryJoinProps) {
  const [displayName, setDisplayName] = useState("");
  const trimmedName = displayName.trim();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedName || busy) return;
    onJoin(trimmedName);
  };

  return (
    <main className={styles.shell}>
      <section className={styles.joinPage} aria-labelledby="repository-join-title">
        <header className={styles.header}>
          <Link className={styles.brand} href="/" aria-label="Ratiflow home">
            <span aria-hidden="true">R</span>
            Ratiflow
          </Link>
          <span className={styles.joinContext}>Shared document</span>
        </header>

        <form className={styles.joinCard} onSubmit={submit}>
          <p className={styles.eyebrow}>You’ve been invited</p>
          <h1 id="repository-join-title">Join this document</h1>
          <p>
            Add the name collaborators should see. It stays attached to your comments,
            revisions, tasks, and the agent paired with this browser session.
          </p>
          <label htmlFor="repository-join-display-name">Your display name</label>
          <input
            autoComplete="name"
            autoFocus
            id="repository-join-display-name"
            name="displayName"
            placeholder="e.g. Nadia Chen"
            value={displayName}
            onChange={(event) => setDisplayName(clampDisplayName(event.target.value))}
          />
          <button disabled={busy || !trimmedName} type="submit">
            {busy ? "Joining…" : "Join document"}
          </button>
          <small>No account needed · Anyone with this link can join</small>
          {error ? <div className={styles.joinError} role="alert">{error}</div> : null}
        </form>
      </section>
    </main>
  );
}
