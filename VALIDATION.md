# Native WebMCP validation record

Status: **go for contract freeze; Chrome-enabled release check remains open**

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

## Deployed evidence — observed 2026-08-30 SGT

Production URL: <https://ratiflow-webmcp.vercel.app/>

Deployment: `dpl_5V5kaQeGee221fwbYWejfamEpGtV`

The first column is a native WebMCP run in Codex desktop's in-app Browser. It is strong
implementation evidence from an OpenAI client, but the final ChatGPT submission surface
must still be rerun during release rehearsal. The connected Chrome instance loaded the
page but did not expose either `modelContext` namespace; its WebMCP flag/Inspector setup
is therefore an explicit manual release prerequisite, not a claimed pass.

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

The same lifecycle was first reproduced locally at `http://localhost:3000/`. On the
production run, collect discovery returned `ratiflow_probe_read_context`,
`ratiflow_probe_wait`, and `ratiflow_probe_add_signal`; review discovery returned the
two base tools plus `ratiflow_probe_prepare_summary`.

These observations establish three product rules:

1. Refresh native handles after every capability change.
2. Limit app-defined `NOT_AVAILABLE_IN_STATE` guarantees to calls that reach page code;
   a native client may reject a removed handle first.
3. Honor an execution cancellation signal when supplied, but tolerate clients that omit
   the optional callback context.

## Go/no-go rule

The contract freeze may proceed because native discovery, invocation, dynamic removal,
and deployed HTTPS behavior are observed end to end on one OpenAI client. Product release
remains blocked until the same deployed flow passes in the final ChatGPT surface and in
Chrome with WebMCP explicitly enabled. The connected Chrome result above is a setup gap,
not evidence that the site or the specification failed.
