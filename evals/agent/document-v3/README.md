# Document v3 agent evidence

This is the canonical input root for `pnpm eval:agent:v3`. No agent run results or
transcripts have been captured here yet, so the default validation intentionally returns
a structured `PENDING` result and exits with status 1.

Only sanitized v3 run ledgers and strict transcript JSON may be added. Never store API
keys, cookies, share or paired tokens, signed sessions, bearer or membership handles,
raw browser storage, bootstrap paths/fragments/base64url bundles, unrelated user data, or
unsanitized agent transcripts. Numeric `promptTokens`, `completionTokens`, and
`totalTokens` counts are metadata, not credentials, and are the only token-named fields
allowed. Every transcript reference must remain beneath the configured root; validation
rejects sensitive field names, credential-shaped values, adapter/direct-API evidence,
and anything outside the allowlisted transcript/oracle schema before scoring.
