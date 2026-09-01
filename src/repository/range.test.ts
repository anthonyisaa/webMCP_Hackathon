import assert from "node:assert/strict";
import { test } from "vitest";

import type { IssueAnchor } from "@/repository/contracts";
import {
  deriveIssueSplice,
  issueSlice,
  makeIssueDiff,
  rebaseIssueAnchor,
  replaceIssueRange,
} from "./range";

const anchor = (start: number, end: number): IssueAnchor => ({
  scope: "SELECTION",
  field: "BODY",
  rangeStart: start,
  rangeEnd: end,
  selectedText: "beta",
  createdRevision: 1,
  anchorRevision: 1,
  anchorState: "ACTIVE",
});

test("derives and replays exact Unicode code-point splices", () => {
  const before = "Alpha 😀 beta gamma";
  const after = replaceIssueRange(before, 8, 12, "delta");
  assert.equal(after, "Alpha 😀 delta gamma");
  assert.equal(issueSlice(before, 8, 12), "beta");
  assert.deepEqual(makeIssueDiff("BODY", before, after), {
    field: "BODY",
    rangeStart: 8,
    rangeEnd: 10,
    before: "be",
    after: "del",
  });
});

test("rebases disjoint anchors and fails overlapping anchors closed", () => {
  const insertion = deriveIssueSplice("Alpha beta", "Long Alpha beta");
  assert.deepEqual(rebaseIssueAnchor(anchor(6, 10), "BODY", insertion, 2), {
    ...anchor(6, 10),
    rangeStart: 11,
    rangeEnd: 15,
    anchorRevision: 2,
  });
  const overlap = deriveIssueSplice("Alpha beta", "Alpha delta");
  assert.equal(rebaseIssueAnchor(anchor(6, 10), "BODY", overlap, 2).anchorState, "STALE");
});
