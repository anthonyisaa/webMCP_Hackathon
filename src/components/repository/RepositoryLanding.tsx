"use client";

import Link from "next/link";

import type { IssueDocumentKind } from "@/repository/contracts";

import styles from "./repository-landing.module.css";

export interface RepositoryLandingProps {
  busy?: boolean;
  error?: string | null;
  onCreate: (kind: IssueDocumentKind) => void;
  onOpenExample?: () => void;
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
    description:
      "Explain what happened, coordinate investigations, and keep corrective decisions attached to the final record.",
    sections: ["Impact", "Timeline", "Root cause", "Corrective actions"],
  },
  {
    kind: "PRODUCT_DOCUMENT",
    eyebrow: "Product",
    title: "Product document",
    description:
      "Shape a proposal with research, implementation tasks, discussion, and a durable record of every decision.",
    sections: ["Problem", "Requirements", "Decisions", "Success metrics"],
  },
];

/** Focused two-template entry point for a new repository document. */
export function RepositoryLanding({
  busy = false,
  error = null,
  onCreate,
  onOpenExample,
}: RepositoryLandingProps) {
  return (
    <main className={styles.shell}>
      <section className={styles.landing} aria-labelledby="repository-landing-title">
        <header className={styles.header}>
          <Link className={styles.brand} href="/" aria-label="Ratiflow home">
            <span aria-hidden="true">R</span>
            Ratiflow
          </Link>
          {onOpenExample ? (
            <button
              className={styles.exampleButton}
              type="button"
              disabled={busy}
              onClick={onOpenExample}
            >
              Open incident example
            </button>
          ) : null}
        </header>

        <div className={styles.intro}>
          <p className={styles.eyebrow}>A shared record for people and their agents</p>
          <h1 id="repository-landing-title">Start with the document you need to finish.</h1>
          <p>
            Work in one place, assign evidence-gathering tasks, discuss exact passages,
            and inspect every revision with its original authority and context.
          </p>
        </div>

        <div className={styles.templateGrid} data-testid="template-picker">
          {TEMPLATE_OPTIONS.map((template) => (
            <button
              className={styles.templateCard}
              data-document-kind={template.kind}
              disabled={busy}
              key={template.kind}
              type="button"
              onClick={() => onCreate(template.kind)}
            >
              <span className={styles.templateIcon} aria-hidden="true">
                {template.kind === "POSTMORTEM" ? "↯" : "◇"}
              </span>
              <span className={styles.templateCopy}>
                <small>{template.eyebrow}</small>
                <strong>{template.title}</strong>
                <span>{template.description}</span>
              </span>
              <span className={styles.sectionPreview} aria-hidden="true">
                {template.sections.map((section) => (
                  <i key={section}>{section}</i>
                ))}
              </span>
              <span className={styles.createLabel}>
                {busy ? "Creating…" : `Create ${template.title.toLowerCase()}`}
                <b aria-hidden="true">→</b>
              </span>
            </button>
          ))}
        </div>

        {error ? (
          <div className={styles.error} role="alert">
            <strong>Couldn’t create the document.</strong>
            <span>{error}</span>
          </div>
        ) : null}

        <footer className={styles.footer}>
          <span>Two document types. One inspectable history.</span>
          <span>Human collaboration works with or without an agent.</span>
        </footer>
      </section>
    </main>
  );
}
