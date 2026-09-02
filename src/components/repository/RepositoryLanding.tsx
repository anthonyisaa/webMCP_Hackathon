"use client";

import Link from "next/link";
import { useState } from "react";

import type { IssueDocumentKind } from "@/repository/contracts";

import styles from "./repository-landing.module.css";

export interface RepositoryLandingProps {
  busy?: boolean;
  error?: string | null;
  onCreate: (kind: IssueDocumentKind, displayName: string) => void;
  onOpenExample?: (kind: IssueDocumentKind, displayName: string) => void;
}

const TEMPLATE_OPTIONS: ReadonlyArray<{
  kind: IssueDocumentKind;
  eyebrow: string;
  title: string;
  description: string;
  sections: readonly string[];
}> = [
  {
    kind: "POSTMORTEM",
    eyebrow: "Incidents",
    title: "Postmortem",
    description: "Understand what happened, delegate investigations, and keep each decision beside the final record.",
    sections: ["Impact", "Timeline", "Root cause", "Corrective actions"],
  },
  {
    kind: "PRODUCT_DOCUMENT",
    eyebrow: "Product",
    title: "Product document",
    description: "Turn evidence, trade-offs, and decisions into one document that remembers how it got there.",
    sections: ["Problem", "Options", "Decisions", "Success measures"],
  },
];

function clampDisplayName(value: string): string {
  return Array.from(value).slice(0, 80).join("");
}

/** Explicit human identity and agent handoff before choosing a document. */
export function RepositoryLanding({ busy = false, error = null, onCreate, onOpenExample }: RepositoryLandingProps) {
  const [displayName, setDisplayName] = useState("");
  const name = displayName.trim();

  return (
    <main className={styles.shell}>
      <section className={styles.landing} aria-labelledby="repository-landing-title">
        <header className={styles.header}>
          <Link className={styles.brand} href="/" aria-label="Ratiflow home"><span aria-hidden="true">R</span>Ratiflow</Link>
          <span className={styles.headerNote}>Documents for people and their agents</span>
        </header>

        <div className={styles.intro}>
          <p className={styles.eyebrow}>Collaborative documents, with memory</p>
          <h1 id="repository-landing-title">A document that remembers why.</h1>
          <p>Set up how you will appear, open a document, then connect the agent you want to mention with <code>@</code>.</p>
        </div>

        <section className={styles.setupCard} aria-labelledby="repository-identity-heading">
          <div className={styles.setupStep}>
            <span aria-hidden="true">1</span>
            <div>
              <p>Your identity</p>
              <h2 id="repository-identity-heading">Choose the nickname collaborators will see.</h2>
              <div className={styles.identityField}>
                <label htmlFor="repository-create-display-name">What should collaborators call you?</label>
                <input
                  id="repository-create-display-name"
                  autoComplete="name"
                  autoFocus
                  placeholder="Your nickname"
                  value={displayName}
                  onChange={(event) => setDisplayName(clampDisplayName(event.target.value))}
                />
                <small>This name labels your edits and owns the agent you connect.</small>
              </div>
            </div>
          </div>
          <aside className={styles.agentHandoff} aria-label="Agent setup comes after opening a document">
            <span>After the document opens</span>
            <strong>Connect the agent you’re bringing.</strong>
            <p>Ask a WebMCP-capable agent to connect with the name it should use. It will then appear in the <code>@</code> menu. Each collaborator connects one current agent; working without one is fine.</p>
          </aside>
        </section>

        <section className={styles.documentSetup} aria-labelledby="repository-template-heading">
          <header>
            <span aria-hidden="true">2</span>
            <div><p>Starting point</p><h2 id="repository-template-heading">Choose a document to open.</h2></div>
            {!name ? <small>Enter your nickname first.</small> : <small>Ready as {name}.</small>}
          </header>
          <div className={styles.templateGrid} data-testid="template-picker">
            {TEMPLATE_OPTIONS.map((template) => (
              <button
                className={styles.templateCard}
                data-document-kind={template.kind}
                disabled={busy || !name}
                key={template.kind}
                type="button"
                onClick={() => onCreate(template.kind, name)}
              >
                <span className={styles.templateIcon} aria-hidden="true">{template.kind === "POSTMORTEM" ? "↯" : "◇"}</span>
                <span className={styles.templateCopy}><small>{template.eyebrow}</small><strong>{template.title}</strong><span>{template.description}</span></span>
                <span className={styles.sectionPreview} aria-hidden="true">{template.sections.map((section) => <i key={section}>{section}</i>)}</span>
                <span className={styles.createLabel}>{busy ? "Opening…" : `Start ${template.title.toLowerCase()}`}<b aria-hidden="true">→</b></span>
              </button>
            ))}
          </div>
        </section>

        {onOpenExample ? (
          <section className={styles.examples} aria-label="Completed examples">
            <div><strong>See the history in action</strong><span>Explore a completed document with human and agent revisions.</span></div>
            <div>
              <button type="button" disabled={busy || !name} onClick={() => onOpenExample("POSTMORTEM", name)}>Explore postmortem</button>
              <button type="button" disabled={busy || !name} onClick={() => onOpenExample("PRODUCT_DOCUMENT", name)}>Explore product document</button>
            </div>
          </section>
        ) : null}

        {error ? <div className={styles.error} role="alert"><strong>Couldn’t open the document.</strong><span>{error}</span></div> : null}

        <footer className={styles.footer}><span>No account required for this prototype.</span><span>Anyone with a document link can join.</span></footer>
      </section>
    </main>
  );
}
