# Native WebMCP validation record

Status: **production native capture recorded; connected Chrome limitation observed**

Started: 2026-08-30 (SGT)

This document records observed behavior. It must never convert an assumption or an
adapter-only test into a native-browser claim.

## Probe contract

The deployed page registers two stable tools and one state-dependent tool through the
first supported namespace in this order:

1. `document.modelContext` — current draft and primary path.
2. `navigator.modelContext` — compatibility observation only if present.

State `collect` exposes `ratiflow_probe_add_signal`; state `review` aborts that
registration and exposes `ratiflow_probe_prepare_summary`. The page also provides an
in-page `getTools()` → `executeTool()` check and a cancellable delay tool.

## Historical probe evidence

The earlier lifecycle probe is historical and does not represent the current product
release. Its Chrome namespace result was a setup gap, not a production product failure.

## Production release evidence — observed 2026-08-30 SGT

Production URL: <https://ratiflow-webmcp.vercel.app/>

Deployment: `dpl_4ypxF5YvesYkHztgok6m3NAFfrZX` (READY, production, `iad1`)

Release commit: `1c47d88f37688b065d910798f3be35b865ab1091`

The sanitized capture at
`evals/results/native/codex-in-app-browser/2026-08-30T141842Z/release.json` covers
N01–N11 and the complete revision 7→11 sequence. It records browser version `null`.

The Codex desktop in-app Browser run is native release evidence from an OpenAI client.
Optional raw `getTools`/`executeTool` and cancellation fields were unavailable in this
wrapper.

An exact-production Chrome recheck at `2026-08-30T17:04:05.586Z` loaded the product
with zero console errors, but that connected client exposed neither
`document.modelContext` nor a WebMCP tab capability. No mutation was attempted. The
sanitized negative observation is
`evals/results/native/chrome-extension/2026-08-30T170405Z/release.json`; it records a
client-setup limitation and is not presented as a product failure or native pass.

### Historical probe matrix (not the current product catalog)

The following table records the earlier probe’s lifecycle checks only; the current
product assertions and revision 7→11 sequence are in the linked release artifact.

| Question | Codex desktop in-app Browser | Connected Chrome |
|---|---|---|
| Secure live URL loads | Pass; HTTP 200 and rendered production page | Pass; production page rendered |
| Namespace detected | Pass; `document.modelContext` | Not configured; page reported `unsupported` |
| Native client discovers current tools | Pass; exact three-tool collect set | Blocked by unavailable namespace |
| State toggle changes actual discovery | Pass; `add_signal` was replaced by `prepare_summary` without reload | Blocked by unavailable namespace |
| Removed-tool call behavior | Client rejected the cached handle before dispatch as stale and required `fetchTools()` | Blocked by unavailable namespace |
| In-page execution | Pass; `getTools()` → `executeTool()` returned the JSON read result | Blocked by unavailable namespace |
| `toolchange` | Callback API not exposed; the app does not use it as an ordering primitive | Blocked by unavailable namespace |
| Execution cancellation signal | Callback context omitted by this client; probe returned `CANCELLATION_SIGNAL_UNAVAILABLE` instead of crashing | Blocked by unavailable namespace |
| Narrow layout after live flow | Pass at 390 CSS px: `scrollWidth === clientWidth`, primary action visible | Not run |
| Runtime health | Zero page console errors after read → cancellation probe → state switch | Zero page console errors; WebMCP controls disabled honestly |

The same lifecycle was first reproduced locally at `http://localhost:3000/`; that is
historical probe evidence. On the historical production probe, collect discovery returned
`ratiflow_probe_read_context`,
`ratiflow_probe_wait`, and `ratiflow_probe_add_signal`; review discovery returned the
two base tools plus `ratiflow_probe_prepare_summary`.

These observations establish three product rules:

1. Refresh native handles after every capability change.
2. Limit app-defined `NOT_AVAILABLE_IN_STATE` guarantees to calls that reach page code;
   a native client may reject a removed handle first.
3. Honor an execution cancellation signal when supplied, but tolerate clients that omit
   the optional callback context.

## Go/no-go rule

The native release trajectory is recorded for one OpenAI client, and the unsupported
connected Chrome surface is recorded separately without overstating it. Agent
trajectories and ablation are complete in [EVAL_RESULTS.md](EVAL_RESULTS.md). Public
repository release and the narrated video remain the submission gates.
