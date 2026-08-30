# Ratiflow

> Agents prepare. People ratify. Work moves.

Ratiflow is a WebMCP-native decision room where the live page compiles workflow state,
selection, and revision into the exact tools an agent may use. A product lead, an
engineering lead, and an agent work on the same decision; agent contributions are
visible and reviewable, stale work is rejected with collaborator-authored changes, and
only the human UI can ratify a consequential decision.

The repository is currently in the native-WebMCP validation stage. The first deployed
surface deliberately proves registration, discovery, dynamic removal, execution, and
cancellation before the product workflow is implemented.

## Local development

```bash
pnpm install
pnpm dev
```

Fast checks:

```bash
.codex/verify.sh
```

The ordinary UI remains usable when WebMCP is unavailable. Native WebMCP requires a
supported secure browser surface; exact tested versions and setup will be recorded in
[`VALIDATION.md`](VALIDATION.md).

## Project documents

- [`product_spec.md`](product_spec.md) — product contract; v1.2 rewrite is in progress.
- [`EVALS.md`](EVALS.md) — evaluation contract; v1.2 rewrite is in progress.
- [`.codex/PLAN.md`](.codex/PLAN.md) — scoped work map and deadline gates.
- [`demo/`](demo/) — running demo, recording, and submission evidence list.

## License

MIT. See [`LICENSE`](LICENSE).
