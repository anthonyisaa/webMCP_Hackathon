# v4 release manifest

`manifest.json` is the checked-in, all-`PENDING` template for the frozen
`repo-document-v4` evaluation contract. Validate it, or an external populated copy, with:

```sh
node evals/release/repo-document-v4/validate.ts [path/to/manifest.json]
```

Exit codes are `0` for release-ready `PASS`, `1` for a schema-valid but incomplete
`PENDING` manifest, and `2` for an invalid or unverifiable claim.

The validator enumerates every D01-D25, B01-B16, N01-N10, A01-A06, V01-V04,
R01-R05, and J01-J04 row, plus the required native ablation gate. A passing row points
to exactly one canonical JSON artifact under its v4 evidence root. The reference hashes
the complete file; the artifact also hashes its canonical `details` payload and binds
the source SHA, deployment identity where applicable, migration, fixtures, capture time,
surface, and evidence class.

Native rows accept only `NATIVE_CAPTURED` artifacts whose eligibility record confirms a
supported client on the top-level issue page and denies injected `modelContext`, internal
API/RPC access, and DOM automation. Adapter captures remain eligible only for browser
rows. Final judges must cite already validated artifacts, meet every criterion threshold,
use unique evaluators, and have no `mustFix`.

A release-ready manifest also requires a clean checkout at the exact source SHA and
explicit SHA equality across public repository HEAD, deployment, manifest, video, and
submission identities. Keep the checked-in template `PENDING`; place populated evidence
in an external content-addressed release bundle so its files do not dirty the source
checkout being attested.
