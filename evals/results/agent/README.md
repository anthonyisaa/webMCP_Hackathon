# Superseded v1.2 agent trajectory ledger

Everything below is historical evidence for fixture `hero-v1.2` and its named release
SHA. It does not satisfy any v3 A01–A07 row. Current v3 runs belong under
`evals/agent/document-v3/<model>/<scenario>/<run>.json` and remain `PENDING` until
captured on the exact v3 release.

Commit one sanitized JSON result per scenario and run at:

`<model>/<scenario>/<run>.json`

There must be exactly five valid runs for A01–A07 on the release candidate. Each file
must include the fields in `evals/agent/score.ts`, including reset verification, commit
SHA, deployed URL, browser surface, model/version, duration, metrics, and a path to a
sanitized transcript. Never include cookies, session tokens, raw storage, or unrelated
workspace content. Missing v3 runs remain `PENDING` in `EVAL_RESULTS.md`.
