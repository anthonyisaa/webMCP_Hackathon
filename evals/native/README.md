# Native browser evidence

`e2e/native.spec.ts` is a surface smoke, not a substitute for the official Chrome /
OpenAI native capture. Run it only against a deployed HTTPS URL with
`RATIFLOW_BASE_URL=<https-url> pnpm eval:native:smoke`. The command is a fail-closed
precondition check, not a release-evidence generator. Attach the browser/client version,
UTC timestamp, URL, release commit, before/after tool descriptions, structured result,
screenshot, and console errors under
`evals/native/document-v3/<surface>/<timestamp>/`.

If the client does not expose optional `getTools`, `executeTool`, `toolchange`, or
cancellation hooks, preserve the dated native observation but leave every unobserved
contract row `PENDING`; use the official Inspector/client for the corresponding
assertion. Never install a fake `document.modelContext` or report an adapter-only test
as native evidence. Passing this smoke alone does not complete N01–N12 or R01–R04.
