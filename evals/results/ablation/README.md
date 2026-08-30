# WebMCP ablation result ledger

Run A01–A03 with the same model/version and seeds in `dynamic-webmcp` and
`static-superset` conditions. Store one machine-readable `summary.json` per model with
success rate, invalid calls, repeated invalid calls, stale-recovery turns, total tool
calls, and time-to-review. The static superset is an eval-only harness condition and
must never be enabled in production. A separate `webmcp-disabled` result records the
ordinary UI fallback qualitatively; it is not evidence of agent tool success.
