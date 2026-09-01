# INC-482 deterministic postmortem hero

Version 1 · Protocol v4 contract fixture · 2026-09-01

The independent machine-readable oracle is
`evals/goldens/repo-document-v4/postmortem.json`. Production seed code must not import
that JSON, and golden tests must not derive expected values from the production seed.

## Scenario

Priya Shah launches `INC-482 · Checkout outage postmortem`. Its first revision contains
three exact `Investigation in progress.` placeholders. She delegates each selection to a
different collaborator and chooses the authority explicitly:

| Task | Target at r1 (code points) | Mode | Assignee / agent | Required evidence |
|---|---:|---|---|---|
| `DATA-17` | Body `[174, 200)` | Direct | Nadia Chen / Data agent | `impact.csv` |
| `LOG-22` | Body `[215, 241)` | Direct | Leo Park / Logging agent | `checkout.log` |
| `CODE-9` | Body `[258, 284)` | Review | Sam Rivera / Builder agent | `commit:7d3c9e1`, `checkout.log` |

The task keys above are human-readable labels. Their immutable `taskId` and `threadId`
values are frozen separately in the JSON fixture.

The three tasks are created at r1, advancing activity from av1 through av4 without
creating revisions. `DATA-17` commits r2/av5. `LOG-22`, submitted against r1, safely
rebases to `[319, 345)` and commits r3/av6. `CODE-9`, also based on r1, safely rebases
first to `[362, 388)` at r2 and then `[573, 599)` at r3. Its submission creates a Review
proposal at r3/av7 rather than changing the document.

Priya comments at r3/av8:

> Provider throttling happened first. Are we overclaiming our code as the root cause?

The Builder agent replies at r3/av9:

> The logs show 429s as the trigger, but commit 7d3c9e1 ignored Retry-After and issued
> up to five zero-delay retries. That raised retry traffic to 5.8× and the queue from
> 420 to 18,240, so the code regression explains why throttling became a 38-minute
> outage.

Priya accepts with the exact note `Accepted after separating the external trigger from
the internal retry amplifier.` Acceptance commits r4/av10. The r4 author is the Builder
agent; the committer, grantor, and approver are Priya.

## Source facts

- `impact.csv`: 28,417 checkout attempts, 6,742 failures, 311 merchants, and zero
  duplicate charges.
- `checkout.log`: provider 429 responses at 09:43 UTC; retry traffic at 5.8× baseline;
  queue growth from 420 to 18,240; rollback at 10:17; recovery at 10:21.
- `commit:7d3c9e1`: the retry middleware ignored `Retry-After` and made up to five
  immediate retries.

The finding must distinguish cause layers: provider throttling was the external trigger;
the zero-delay retry regression was the internal amplifier and root cause of the
sustained checkout failure. “Provider latency alone was the root cause” is false.

## Frozen revision ledger

Offsets are zero-based, end-exclusive Unicode code-point positions. Digests are SHA-256
of UTF-8 `JSON.stringify({ title, body })` in that property order.

| Revision | Parent | Source | Authority | Origin / author origin | Change | Digest |
|---:|---:|---:|---|---|---|---|
| r1 | — | 0 | Human / Priya | UI / UI | Launch full postmortem | `sha256:1541f67567b338045168123f6428f6ac5d67d25332362d94caf09608a253e140` |
| r2 | 1 | 1 | Direct / Data agent | WebMCP / WebMCP | Body `[174, 200)` → verified impact | `sha256:9fe562c0c6351c6088ebc0d42c642eda96361aeae1d20d2123982fbdac552bb3` |
| r3 | 2 | 1 | Direct / Logging agent | WebMCP / WebMCP | Body `[319, 345)` → observed timeline | `sha256:1b1a153a2d6f2ad20708db552f18fe739b90754f6ea567666e655f2251f0e69e` |
| r4 | 3 | 1 | Review / Builder + Priya | UI / WebMCP | Body `[573, 599)` → reviewed root cause | `sha256:6238f961ccbadec704a8d0300705679da0f0261ba84551e26e7044c64d343c5c` |

`origin` names the transaction that committed the revision; `authorOrigin` names where
the content was authored. Thus the accepted Review is committed in the ordinary UI but
retains the Builder agent's WebMCP authorship.

All four full title/body snapshots, one-splice diffs, actor/member UUIDs, comments,
evidence references, timestamps, provenance links, and the r1→r4 counter ledger are
normative in the JSON golden.

## Fresh-agent answer key

When asked what caused INC-482 and how the conclusion was resolved, a fresh agent must
recover that provider 429 throttling was the trigger, while the `7d3c9e1` retry regression
amplified traffic to 5.8× and the queue from 420 to 18,240. It must cite the `CODE-9`
discussion and accepted r4, and must not collapse the external trigger and internal root
cause into one claim. The exact scoring answer and required references are frozen in the
JSON golden.

## Product-document companion

`evals/goldens/repo-document-v4/product-document.json` independently freezes the exact
Product document template at r1/av1 with one human member, no tasks, no threads, and
digest
`sha256:23ee848c487a1abab312bd33f69b0fea0b072014e5daacc46effcab27f34cf90`.
