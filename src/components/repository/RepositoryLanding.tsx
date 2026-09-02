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
  specialist: string;
  guidedAction: string;
}> = [
  {
    kind: "POSTMORTEM",
    eyebrow: "Incidents",
    title: "Postmortem",
    description: "A two-sheet incident record with prior human and agent revisions—and one root-cause question left for you.",
    sections: ["Impact", "Timeline", "Root cause", "Corrective actions"],
    specialist: "@Code",
    guidedAction: "Verify the failure against a synthetic repository",
  },
  {
    kind: "PRODUCT_DOCUMENT",
    eyebrow: "Product",
    title: "Product document",
    description: "A two-sheet launch decision with prior collaboration—and one capacity question left for you.",
    sections: ["Problem", "Options", "Decisions", "Success measures"],
    specialist: "@Data",
    guidedAction: "Check the launch plan against synthetic metrics",
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
          <div className={styles.headerActions}><span className={styles.headerNote}>The document is the agent runtime</span><Link className={styles.deckLink} href="/deck">View the 12-slide story</Link></div>
        </header>

        <div className={styles.intro}>
          <p className={styles.eyebrow}>A living document for humans + agents</p>
          <h1 id="repository-landing-title">Mention the expert.<br />Keep the proof.</h1>
          <p>Choose a nickname and open either working demo. Select a passage and mention a specialist. In a WebMCP-enabled browser, this open page supplies role-specific tools to GPT-5.6 Luna; the resulting change lands as a reversible revision.</p>
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
                <small>This name labels your edits, comments, and approvals.</small>
              </div>
            </div>
          </div>
          <aside className={styles.agentHandoff} aria-label="Managed demo agent directory">
            <span>Listed in every demo copy</span>
            <strong>Your specialist directory</strong>
            <div className={styles.agentPreview}>
              <span><i data-agent="data">D</i><b>@Data</b><small>Metrics</small></span>
              <span><i data-agent="code">C</i><b>@Code</b><small>Repository</small></span>
              <span><i data-agent="general">G</i><b>@General</b><small>Writing</small></span>
            </div>
            <p>No agent setup is required. Managed agents run only in a WebMCP-enabled browser while this document page is open; the 15-second check is recovery, not background cron.</p>
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
                onClick={() => (onOpenExample ?? onCreate)(template.kind, name)}
              >
                <span className={styles.templateIcon} aria-hidden="true">{template.kind === "POSTMORTEM" ? "↯" : "◇"}</span>
                <span className={styles.templateCopy}><small>{template.eyebrow}</small><strong>{template.title}</strong><span>{template.description}</span></span>
                <span className={styles.sectionPreview} aria-hidden="true">{template.sections.map((section) => <i key={section}>{section}</i>)}</span>
                <span className={styles.guidedAction}><b>{template.specialist}</b><span>{template.guidedAction}</span></span>
                <span className={styles.createLabel}>{busy ? "Opening…" : `Open live ${template.title.toLowerCase()}`}<b aria-hidden="true">→</b></span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.runtimeNote} aria-label="How the managed relay works">
          <span className={styles.runtimePulse} aria-hidden="true" />
          <div><strong>Page-bound, visible, reversible.</strong><span>The Flight Recorder shows the discovered catalog, every tool call, its synthetic evidence, and the exact revision.</span></div>
          <code>Application-owned WebMCP relay · GPT-5.6 Luna</code>
        </section>

        <details className={styles.blankTemplates}>
          <summary>Prefer a blank document?</summary>
          <div>
            <p>Blank templates keep ordinary editing, comments, history, and Restore.</p>
            <button type="button" disabled={busy || !name} onClick={() => onCreate("POSTMORTEM", name)}>Blank postmortem</button>
            <button type="button" disabled={busy || !name} onClick={() => onCreate("PRODUCT_DOCUMENT", name)}>Blank product document</button>
          </div>
        </details>

        {error ? <div className={styles.error} role="alert"><strong>Couldn’t open the document.</strong><span>{error}</span></div> : null}

        <footer className={styles.footer}><span>No account required for this prototype.</span><span>Synthetic demo sources are always labeled.</span><span>Anyone with a document link can join.</span></footer>
      </section>
    </main>
  );
}
