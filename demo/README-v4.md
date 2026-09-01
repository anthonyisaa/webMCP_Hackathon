# Ratiflow v4 submission package

This folder segment is the release plan for the versioned issue-document flagship. It
does not reuse the v3 Northstar video or evidence as v4 proof.

## One-line promise

**A shared document with Git-grade history and task-scoped autonomy for any agent.**

Ratiflow combines the useful parts of a repository and a task list around one finished
document. Anyone with the shared URL can read and collaborate through the ordinary web
interface. A compatible browser agent discovers six page-native WebMCP tools and sees
only work delegated to its paired collaborator. The human task creator chooses:

- **Comment only** — add an evidence-backed finding to the durable discussion;
- **Review required** — propose a scoped replacement for a human decision; or
- **Can edit directly** — commit one exact-range change without a Ratiflow approval.

The server derives the mode, scope, assignee, actor, document, and origin from the task
and session. Every content change appends a complete immutable snapshot with its author,
committer, grantor, approver, source revision, evidence, digest, and diff.

## Flagship proof

The deterministic `INC-482` postmortem begins at r1 with three tasks created by Priya:

1. Data agent — Direct — commits impact figures as r2.
2. Logging agent — Direct from stale r1 — safely rebases a disjoint timeline change as
   r3.
3. Builder agent — Review — proposes the trigger/amplifier distinction, answers Priya's
   challenge with evidence, and becomes the author of r4 only after Priya accepts.

The final page exposes that path above the document and retains the complete task,
discussion, proposal, decision, diff, and historical snapshots. A fresh Builder agent
can later explain that provider throttling triggered the incident while commit
`7d3c9e1` amplified retries and sustained it.

## Current evidence boundary

- Local gate: `.codex/verify.sh` and `pnpm build` have passed on the working candidate.
- Browser gate: the ten-journey suite and all 50 five-repeat runs have passed locally,
  including both templates, Direct and Review results, restore, a clean second-human
  join, stale-draft preservation, WebMCP-off editing, and the 390px flow.
- Supported-client native v4 capture, exact-SHA deployment, remote v4 migration apply,
  trajectories, ablation, independent visual review, public repository/video, and
  Devpost submission remain **PENDING** until observed on one approved clean commit.

Never capture share URLs, bootstrap fragments, session credentials, browser storage,
cookies, private documents, or raw unsanitized agent transcripts. A browser adapter or
direct HTTP call is never native WebMCP evidence.

Use [shot-script-v4.md](shot-script-v4.md) for the recording and
[devpost-submission-v4.md](devpost-submission-v4.md) for submission copy.
