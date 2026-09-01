# Release baseline reconciliation
_Recorded: 2026-09-01T08:44:40+08:00_

## Authority

- Release baseline: `origin/main@5957bb4`.
- Local working branch: `main@65aadb7`, intentionally dirty and two commits behind.
- This inventory is content-level only. It does not reset, merge, stage, commit, or
  discard the working tree.

## Byte-level inventory

A read-only comparison of every `origin/main` blob against the current filesystem found
199 identical paths, 43 differing paths, and 26 remote paths absent locally.

The complete v2 shared-document implementation is present and byte-identical to the
remote release, including:

- `src/components/document/{DocumentWebMCPBridge,annotation-rail,document-editor,
  document-http-service}` and the editor CSS module;
- `src/document/{contracts,range,surface-reconciliation}`;
- `src/domain/document-service.ts` and
  `src/domain/supabase/document-supabase-service.ts`;
- `src/webmcp/document-{catalog,executor,registration}.ts`; and
- the applied shared-document and annotation-queue migrations.

This proves the document pivot can extend the tracked remote document baseline rather
than reconstructing an untracked product.

## Classification

### Port and evolve

- The active shared-decision-memory plan and its C0 contract changes.
- The document-specific browser specs, native proof requirements, and editor product
  correction currently present in the root.
- The root-route choice to make the document the submission flagship, after exact-SHA
  preview and compatibility gates pass.

### Retain as compatibility and reuse

- `docs/contracts/live-agent-session-contract.md`, the decision-room domain/UI/routes,
  and `/decision-demo`.
- `src/webmcp/activity-signal-hub.ts`, `coordination-catalog.ts`,
  `live-registration.ts`, `registry.ts`, and their tests. The v3 document wait must
  reuse their page-local invalidation and stable registration patterns.
- The four later live-session migrations on `origin/main`; they remain in migration
  order and are never edited.
- Production deployment/evidence for the v1.5 live decision-room loop. It remains the
  rollback release until the document v3 exact-SHA gates pass.

### Supersede for the submission story only

- Decision-room flagship language in `product_spec.md`, `EVALS.md`, README/demo copy,
  and the root launch surface.
- Direct v2 agent mutation, creator-owned annotation listing, visible stage workflow,
  persistent annotation composer, and copied-prompt hero on new v3 documents.

The v2 implementation and RPC behavior remain scoped to v2 rows for rollback. New v3
rows reject the legacy direct-apply path; v2 rows reject v3 proposal RPCs.

## Absent remote files to restore before integration

The 26 filesystem-absent paths are the live-session contract/spec, workspace adapter
routes/tests, page routes, live domain tests, activity/registry files, and four later
migrations recorded in the R0 command output. They are not required to edit the C0 v3
document façade, but the release gate must restore them from `origin/main` without
overwriting local document changes before the full test/build or any publication.

## Gate

R0 content reconciliation is complete. Git/release identity reconciliation remains
open and blocks commit, push, deployment promotion, public-source claims, native
capture, and submission.
