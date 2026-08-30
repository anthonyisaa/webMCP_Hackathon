# Ratiflow

> Agents prepare. People ratify. Work moves.

Ratiflow is a WebMCP-native decision room where the live page compiles workflow state,
selection, and revision into the exact tools an agent may use. A product lead, an
engineering lead, and an agent work on the same decision; agent contributions are
visible and reviewable, stale work is rejected with collaborator-authored changes, and
only the human UI can ratify a consequential decision.

The native-WebMCP validation probe is deployed and the v1.2 product, capability, hero,
and evaluation contracts are frozen. Product implementation now proceeds against those
reviewed boundaries.

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

- [`product_spec.md`](product_spec.md) — frozen v1.2 product contract.
- [`EVALS.md`](EVALS.md) — frozen three-layer evaluation contract.
- [`docs/contracts/`](docs/contracts/) — exact hero and capability/wire contracts.
- [`.codex/PLAN.md`](.codex/PLAN.md) — scoped work map and deadline gates.
- [`demo/`](demo/) — running demo, recording, and submission evidence list.

## License

MIT. See [`LICENSE`](LICENSE).
