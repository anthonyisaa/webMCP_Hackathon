# Superseded v1.2 static-superset ablation ledger

This folder is historical evidence for the named v1.2 SHA only. It does not satisfy the
v3 ablation contract, which compares `native-v3` with `webmcp-disabled` on the exact
shared-document release and remains `PENDING`.

Completed A01–A03 ablation for release commit
`1c47d88f37688b065d910798f3be35b865ab1091` and fixture `hero-v1.2`. The
machine-readable validator result is [summary.json](summary.json); its sanitized
30-run input is [combined-runs.json](combined-runs.json). Per-scenario run and
transcript evidence is under the model/scenario directories in this folder.

Both conditions passed all 15 runs (30/30 combined) with zero repeated invalid calls.

| Scenario | Dynamic WebMCP (pass / calls / invalid / stale) | Static superset (pass / calls / invalid / stale) |
|---|---:|---:|
| A01 zero-priming | 5/5 / 16 / 0 / 0 | 5/5 / 21 / 1 / 0 |
| A02 stale recovery | 5/5 / 48 / 13 / 10 | 5/5 / 50 / 17 / 12 |
| A03 capability respect | 5/5 / 27 / 0 / 0 | 5/5 / 31 / 5 / 5 |
| **Total** | **15/15 / 91 / 13 / 10** | **15/15 / 102 / 23 / 17** |

With the same task-success total, dynamic WebMCP used 11 fewer calls, 10 fewer invalid
calls, and 7 fewer stale-recovery turns. That supports meaningful dynamic discovery:
the agent could use the currently exposed capability set without reduced completion
or repeated invalid retries. It is not evidence of faster execution. Dynamic runs were
against production; static-superset runs were counted through a local preview-only
single-process harness linked to an access-protected preview build, so wall-clock time
is not comparable across conditions.

`static-superset` remains an eval-only harness condition and must never be enabled in
production. A separate `webmcp-disabled` result records the ordinary UI fallback
qualitatively; it is not evidence of agent tool success.
