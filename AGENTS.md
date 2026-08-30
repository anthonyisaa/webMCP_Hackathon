# Ratiflow repository guide

## Commands

- Install: `pnpm install`
- Develop: `pnpm dev`
- Fast gate: `.codex/verify.sh`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Unit/protocol tests: `pnpm test`
- Native browser evals: `RATIFLOW_BASE_URL=<https-url> pnpm eval:native`
- Production build: `pnpm build`

`pnpm build` deliberately uses Next.js's webpack path. Turbopack's CSS worker may try
to bind a helper port that is blocked in the managed development sandbox.

## Source of truth and layout

- `.codex/PLAN.md` owns stream scope, files, order, and deadline gates.
- `product_spec.md`, `EVALS.md`, and `docs/contracts/` own product/tool/eval contracts
  after the C0 freeze. Do not invent names, states, schemas, seed facts, or errors in a
  feature stream.
- `src/app/` owns App Router pages and route handlers.
- `src/domain/` owns domain behavior; `src/capabilities/` owns the pure compiler;
  `src/webmcp/` owns browser lifecycle code; `supabase/` owns migrations.
- `demo/` contains sanitized recording and submission evidence only.

## Constraints

- Use `document.modelContext` as the standards path. Any `navigator.modelContext`
  support is an observed compatibility fallback, not the public contract.
- Register tools only from the top-level page, unregister with `AbortSignal`, validate
  inputs in application/server code, honor execution cancellation, and return only
  JSON-serializable results.
- Tool presence guides the agent; revision checks, workspace isolation, and business
  rules are enforced server-side. Never trust model-supplied actor or origin fields.
- The ordinary human UI must remain usable when WebMCP is absent.
- Do not commit secrets, cookies, membership handles, raw private content, or unsanitized
  agent transcripts. Do not mark native validation rows passed without observed evidence.
- Do not edit `next-env.d.ts` or generated `.next/` files.

## Definition of done

Run `.codex/verify.sh`, then the verification named in the owning PLAN stream. UI work
also needs a driven browser flow and `dev-visual-review`; native WebMCP claims need dated
evidence from the deployed supported surface rather than adapter-only tests.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
