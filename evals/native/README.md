# Native browser evidence

`e2e/native.spec.ts` is a surface smoke, not a substitute for the official Chrome /
OpenAI native capture. Run it only against a deployed HTTPS URL with
`RATIFLOW_BASE_URL`. Attach the browser/client version, UTC timestamp, URL, release
commit, before/after tool descriptions, structured result, screenshot, and console
errors under `evals/results/native/<surface>/<timestamp>/`.

If the client does not expose optional `getTools`, `executeTool`, `toolchange`, or
cancellation hooks, record that observation as `PENDING`/`NATIVE_CAPTURED` and use the
official Inspector/client for the corresponding assertion. Never install a fake
`document.modelContext` or report an adapter-only test as native evidence.
