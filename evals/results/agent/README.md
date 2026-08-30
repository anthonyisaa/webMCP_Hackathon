# Agent trajectory result ledger

Commit one sanitized JSON result per scenario and run at:

`<model>/<scenario>/<run>.json`

There must be exactly five valid runs for A01–A07 on the release candidate. Each file
must include the fields in `evals/agent/score.ts`, including reset verification, commit
SHA, deployed URL, browser surface, model/version, duration, metrics, and a path to a
sanitized transcript. Never include cookies, session tokens, raw storage, or unrelated
workspace content. Missing runs remain `PENDING` in `EVAL_RESULTS.md`.
