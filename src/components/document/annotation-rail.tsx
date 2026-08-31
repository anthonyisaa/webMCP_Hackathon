"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

import {
  DOCUMENT_CUSTOM_INSTRUCTION_MAX_LENGTH,
  type DocumentAnnotation,
  type DocumentStage,
} from "@/document/contracts";
import type { DocumentAgentCommand } from "@/document/commands";

import styles from "./document-editor.module.css";

export interface AnnotationTargetPreview {
  fieldLabel: "Title" | "Body";
  targetLabel: "Selection" | "Caret" | "Document";
  excerpt: string;
}

interface AnnotationRailProps {
  open: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  stage: DocumentStage;
  target: AnnotationTargetPreview;
  commands: DocumentAgentCommand[];
  customInstruction: string;
  composerBusy: boolean;
  cancellingAnnotationId: string | null;
  annotations: DocumentAnnotation[];
  selfMemberId: string | null;
  highlightedAnnotationId: string | null;
  webMcpSupported: boolean | null;
  agentApplying: boolean;
  requestCopied: boolean;
  onCustomInstructionChange: (value: string) => void;
  onPreset: (command: DocumentAgentCommand) => void;
  onSubmitCustom: () => void;
  onClear: () => void;
  onCancelAnnotation: (annotationId: string) => void;
  onCopyAgentRequest: () => void;
  onClose: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

function compareAnnotations(left: DocumentAnnotation, right: DocumentAnnotation): number {
  return left.createdAt.localeCompare(right.createdAt) ||
    left.annotationId.localeCompare(right.annotationId);
}

function boundedExcerpt(value: string, fallback: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return fallback;
  const points = Array.from(compact);
  return points.length > 112 ? `${points.slice(0, 109).join("")}…` : compact;
}

function clampCodePoints(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  const points = Array.from(value);
  return points.length > maximum ? points.slice(0, maximum).join("") : value;
}

function annotationExcerpt(annotation: DocumentAnnotation): string {
  const field = annotation.targetField === "TITLE" ? "title" : "body";
  const fallback =
    annotation.targetKind === "DOCUMENT"
      ? `Whole ${field}`
      : annotation.targetKind === "CARET"
        ? `Caret in ${field}`
        : `Selection in ${field}`;
  return boundedExcerpt(annotation.selectedText, fallback);
}

function statusLabel(status: DocumentAnnotation["status"]): string {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "STALE":
      return "Needs a new target";
  }
}

function AnnotationCard({
  annotation,
  selfMemberId,
  highlighted,
  cancelling,
  onCancel,
}: {
  annotation: DocumentAnnotation;
  selfMemberId: string | null;
  highlighted: boolean;
  cancelling: boolean;
  onCancel: (annotationId: string) => void;
}) {
  const ownPending =
    annotation.status === "PENDING" && annotation.createdBy.memberId === selfMemberId;

  return (
    <article
      id={`annotation-${annotation.annotationId}`}
      className={styles.annotationCard}
      data-status={annotation.status.toLowerCase()}
      data-highlighted={highlighted ? "true" : undefined}
      data-testid="annotation-card"
    >
      <div className={styles.annotationCardTopline}>
        <span className={styles.annotationKind}>
          {annotation.kind === "STAGE_PREPARATION" ? "Stage prep" : annotation.label}
        </span>
        <span className={styles.annotationStatus} data-status={annotation.status.toLowerCase()}>
          {statusLabel(annotation.status)}
        </span>
      </div>

      {annotation.kind === "STAGE_PREPARATION" ? (
        <strong className={styles.annotationLabel}>{annotation.label}</strong>
      ) : null}
      <p className={styles.annotationInstruction}>{annotation.instruction}</p>
      <blockquote className={styles.annotationExcerpt}>{annotationExcerpt(annotation)}</blockquote>
      <div className={styles.annotationMeta}>
        <span>{annotation.createdBy.displayName}</span>
        <span>{annotation.targetField === "TITLE" ? "Title" : "Body"}</span>
        <span>{annotation.targetKind === "SELECTION" ? "Selection" : annotation.targetKind === "CARET" ? "Caret" : "Document"}</span>
      </div>

      {ownPending ? (
        <button
          className={styles.cancelAnnotation}
          type="button"
          disabled={cancelling}
          onClick={() => onCancel(annotation.annotationId)}
          aria-label={`Cancel ${annotation.label}`}
        >
          {cancelling ? "Cancelling…" : "Cancel"}
        </button>
      ) : null}
    </article>
  );
}

export function AnnotationRail({
  open,
  headingRef,
  composerRef,
  stage,
  target,
  commands,
  customInstruction,
  composerBusy,
  cancellingAnnotationId,
  annotations,
  selfMemberId,
  highlightedAnnotationId,
  webMcpSupported,
  agentApplying,
  requestCopied,
  onCustomInstructionChange,
  onPreset,
  onSubmitCustom,
  onClear,
  onCancelAnnotation,
  onCopyAgentRequest,
  onClose,
  onKeyDown,
}: AnnotationRailProps) {
  const pending = annotations
    .filter((annotation) => annotation.status === "PENDING")
    .sort(compareAnnotations);
  const history = annotations
    .filter((annotation) => annotation.status !== "PENDING")
    .sort(compareAnnotations);
  const presets = commands.filter((command) => command.presetId !== "custom");

  const submitCustom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmitCustom();
  };

  return (
    <aside
      id="annotation-rail"
      className={styles.annotationRail}
      data-open={open ? "true" : "false"}
      aria-label="Agent annotations"
      onKeyDown={onKeyDown}
    >
      <div className={styles.railHeader}>
        <div>
          <span className={styles.railEyebrow}>Collaborative queue</span>
          <h2 ref={headingRef} tabIndex={-1}>Agent annotations</h2>
        </div>
        <div className={styles.railHeaderActions}>
          <span className={styles.pendingPill}>{pending.length} pending</span>
          <button
            className={styles.closeRailButton}
            type="button"
            aria-label="Close agent annotations"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>

      <section className={styles.composerSection} aria-labelledby="annotation-composer-heading">
        <div className={styles.sectionHeading}>
          <h3 id="annotation-composer-heading">Add instruction</h3>
          <kbd>⌘K</kbd>
        </div>

        <div className={styles.targetPreview} data-testid="annotation-target-preview">
          <div>
            <span>{target.targetLabel}</span>
            <span>{target.fieldLabel}</span>
          </div>
          <p>{target.excerpt}</p>
        </div>

        <div className={styles.presetGrid} aria-label={`${stage.toLowerCase()} annotation presets`}>
          {presets.map((command) => (
            <button
              key={command.presetId}
              type="button"
              disabled={composerBusy}
              onClick={() => onPreset(command)}
            >
              {command.label}
            </button>
          ))}
        </div>

        <form className={styles.annotationComposer} onSubmit={submitCustom}>
          <label htmlFor="custom-agent-instruction">Custom instruction</label>
          <textarea
            ref={composerRef}
            id="custom-agent-instruction"
            value={customInstruction}
            rows={3}
            placeholder="What should your agent help with?"
            onChange={(event) =>
              onCustomInstructionChange(
                clampCodePoints(
                  event.target.value,
                  DOCUMENT_CUSTOM_INSTRUCTION_MAX_LENGTH,
                ),
              )
            }
          />
          <div className={styles.composerActions}>
            <button type="button" onClick={onClear}>Clear</button>
            <button type="submit" disabled={composerBusy || customInstruction.trim().length === 0}>
              {composerBusy ? "Adding…" : "Add to queue"}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.queueSection} aria-labelledby="pending-annotations-heading">
        <div className={styles.sectionHeading}>
          <h3 id="pending-annotations-heading">Pending</h3>
          <span>{pending.length}</span>
        </div>
        {pending.length > 0 ? (
          <div className={styles.annotationList} data-testid="pending-annotation-list">
            {pending.map((annotation) => (
              <AnnotationCard
                key={annotation.annotationId}
                annotation={annotation}
                selfMemberId={selfMemberId}
                highlighted={annotation.annotationId === highlightedAnnotationId}
                cancelling={annotation.annotationId === cancellingAnnotationId}
                onCancel={onCancelAnnotation}
              />
            ))}
          </div>
        ) : (
          <p className={styles.emptyQueue}>Select text or place the caret, then add an instruction.</p>
        )}
      </section>

      {history.length > 0 ? (
        <section className={styles.queueSection} aria-labelledby="annotation-history-heading">
          <div className={styles.sectionHeading}>
            <h3 id="annotation-history-heading">Recent</h3>
            <span>{history.length}</span>
          </div>
          <div className={styles.annotationList} data-testid="annotation-history-list">
            {history.map((annotation) => (
              <AnnotationCard
                key={annotation.annotationId}
                annotation={annotation}
                selfMemberId={selfMemberId}
                highlighted={false}
                cancelling={false}
                onCancel={onCancelAnnotation}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.agentHandoff} data-testid="agent-handoff">
        <div className={styles.agentAvailability}>
          <span className={styles.agentDot} aria-hidden="true" />
          <strong>{agentApplying ? "Agent applying annotation…" : `WebMCP ${webMcpSupported === null ? "checking…" : webMcpSupported ? "available" : "unavailable"}`}</strong>
        </div>
        {webMcpSupported === false ? <p>The editor and copied prompt still work without WebMCP.</p> : null}
        <p>Copies a prompt only. It does not send or notify ChatGPT.</p>
        <button className={styles.askChatGptButton} type="button" onClick={onCopyAgentRequest}>
          Ask ChatGPT
        </button>
        <p className={styles.copyConfirmation} aria-live="polite">
          {requestCopied ? "Prompt copied — paste/send in ChatGPT" : "You will paste or send it yourself."}
        </p>
      </section>
    </aside>
  );
}
