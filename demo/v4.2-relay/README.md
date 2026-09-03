# Ratiflow v4.2 screenshot pack

This directory is the operator aid for the final live walkthrough. It intentionally
contains no generated video and no legacy media. Follow
[recording-runbook.md](recording-runbook.md), then place only visually inspected PNGs in
`screenshots/`.

The claim boundary is exact:

> WebMCP changes the live browser catalog from idle tools to one role- and run-scoped
> catalog. That catalog remains stable during the managed run. Separately, the relay
> exposes and pins one required discovered function on each Luna continuation; Luna
> composes that function's strict arguments, and the page executes the returned call.

Do not say that WebMCP republishes a catalog on every Luna turn or that Luna chooses the
workflow.

## Evidence classes

| Class | What it supports | What it does not support |
| --- | --- | --- |
| `PRODUCT_UI` | A real visible product state and judge flow. | A live Luna call, native WebMCP, or deployment reliability. |
| `APPLICATION_TRACE` | The Flight Recorder's bounded, application-observed catalog and execution events. | Native-browser attestation or a live provider call by itself. |
| `LIVE_LUNA` | A named real run reconciled to the server-held `gpt-5.6-luna` path, exact deployed SHA, task, attempt, and revision. | Native Luna Site Tools or native WebMCP by itself. |
| `NATIVE_WEBMCP` | A dated supported client observing or invoking the standard `document.modelContext` surface on the exact deployed SHA. | Luna behavior or the application-owned relay. |
| `LOCAL_REHEARSAL` | Local or automated behavior on the recorded candidate. | Production, native-client, or live-provider claims. |
| `PROPOSED_SPEC` | A clearly labeled future direction. | Current WebMCP behavior. |

The seven core screenshots below are product/application captures. None is
`NATIVE_WEBMCP`. Native evidence must be captured and manifested separately from a
supported client; an adapter, Playwright injection, compatibility surface, Flight
Recorder, or direct HTTP call cannot be relabeled as native proof.

## Core filename manifest

Leave `Status` as `PENDING` until the exact file exists, has been visually inspected, and
its metadata is recorded. A frame may receive the stronger `LIVE_LUNA` class only after
its lineage reconciles to the real production run; otherwise keep its fallback class.

| # | Filename | Required scene | Evidence class | Fallback class | Status |
| ---: | --- | --- | --- | --- | --- |
| 1 | `01-picker-ready.png` | Nickname entered, managed directory, and both document choices visible. | `PRODUCT_UI` | — | `PENDING` |
| 2 | `02-code-assignment.png` | Root cause selection, exact frozen `@Code` prompt, and `Assign & run`. | `PRODUCT_UI` | — | `PENDING` |
| 3 | `03-code-discovery-first-turn.png` | Code's seven-tool catalog plus discovery or `read_assignment` as the active first turn. | `APPLICATION_TRACE` | — | `PENDING` |
| 4 | `04-code-r6-completion.png` | Three-bullet Root cause result, r6, completion trace, and restored-idle event. | `LIVE_LUNA` | `APPLICATION_TRACE` | `PENDING` |
| 5 | `05-general-role-swap.png` | General's seven-tool catalog with style tools and no Code specialty tools. | `APPLICATION_TRACE` | — | `PENDING` |
| 6 | `06-history-code-r6.png` | Code r6 detail at r7: provenance, diff, evidence, immutable snapshot, and `Restore r6`. | `LIVE_LUNA` | `PRODUCT_UI` | `PENDING` |
| 7 | `07-data-r7-result.png` | Data's Success measures result and linked r7 evidence. | `LIVE_LUNA` | `PRODUCT_UI` | `PENDING` |

For every completed row, record the following immediately below the table or in the
submission's release manifest:

```text
file:
evidence_class:
full_git_sha:
deployment_root_url:          # origin only; never an /issue/ URL
captured_at_utc:
client_and_version:
viewport_css_px: 1440x1000
device_pixel_ratio: 1
sanitized_lineage_alias:      # e.g. PM-A-Code; never raw task/run/attempt IDs
result_revision:
capturer:
source_capture_or_crop:
visual_inspection: PASS|FAIL
notes:
```

## Acceptance checklist

- All core files resolve to the same approved release SHA and public deployment origin.
- PNG dimensions, viewport, DPR, client/version, and UTC time match the manifest.
- No address bar, browser chrome, `/issue/` URL, share token, bootstrap fragment, cookie,
  local/session storage, authorization value, API key, private identifier, raw provider
  payload, unrestricted transcript, or chain-of-thought appears.
- Code and Data evidence is visibly identified as synthetic by the product state or its
  adjacent evidence detail; no overlay is added afterward to manufacture provenance.
- The Code, General, and Data catalogs have 7, 7, and 6 logical tools respectively; idle
  and managed catalogs are never shown as simultaneous live surfaces.
- Application trace, live Luna, native WebMCP, local rehearsal, and proposed-spec claims
  retain their separate labels.
- The whole viewport source is retained before any derived crop. Every crop points back
  to its source capture, and no crop removes a truth label or contradictory state.
- Any frame with `Retry once`, an error, a 5xx-correlated state, an unresolved placeholder,
  or mismatched revision is discarded rather than edited into a pass.

