import type {
  IssueAnchor,
  IssueDocumentField,
  IssueRevisionDiff,
} from "@/repository/contracts";

export type IssueSplice = {
  start: number;
  end: number;
  before: string;
  after: string;
};

export function issueCodePoints(value: string): string[] {
  return Array.from(value);
}

export function issuePointLength(value: string): number {
  return issueCodePoints(value).length;
}

export function issueSlice(value: string, start: number, end: number): string {
  return issueCodePoints(value).slice(start, end).join("");
}

export function deriveIssueSplice(previous: string, next: string): IssueSplice | null {
  if (previous === next) return null;
  const before = issueCodePoints(previous);
  const after = issueCodePoints(next);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix
    && suffix < after.length - prefix
    && before[before.length - suffix - 1] === after[after.length - suffix - 1]
  ) {
    suffix += 1;
  }
  return {
    start: prefix,
    end: before.length - suffix,
    before: before.slice(prefix, before.length - suffix).join(""),
    after: after.slice(prefix, after.length - suffix).join(""),
  };
}

export function makeIssueDiff(
  field: IssueDocumentField,
  previous: string,
  next: string,
): IssueRevisionDiff | null {
  const splice = deriveIssueSplice(previous, next);
  if (!splice) return null;
  return {
    field,
    rangeStart: splice.start,
    rangeEnd: splice.end,
    before: splice.before,
    after: splice.after,
  };
}

export function replaceIssueRange(
  value: string,
  start: number,
  end: number,
  replacement: string,
): string {
  const points = issueCodePoints(value);
  return `${points.slice(0, start).join("")}${replacement}${points.slice(end).join("")}`;
}

export function rebaseIssueAnchor(
  anchor: IssueAnchor,
  field: IssueDocumentField,
  splice: IssueSplice | null,
  nextRevision: number,
): IssueAnchor {
  if (anchor.scope === "DOCUMENT") {
    return { ...anchor, anchorRevision: nextRevision };
  }
  if (anchor.anchorState === "STALE") return anchor;
  if (anchor.field !== field || !splice) {
    return { ...anchor, anchorRevision: nextRevision };
  }
  if (anchor.rangeEnd <= splice.start) {
    return { ...anchor, anchorRevision: nextRevision };
  }
  if (anchor.rangeStart >= splice.end) {
    const delta = issuePointLength(splice.after) - (splice.end - splice.start);
    return {
      ...anchor,
      rangeStart: anchor.rangeStart + delta,
      rangeEnd: anchor.rangeEnd + delta,
      anchorRevision: nextRevision,
    };
  }
  return { ...anchor, anchorState: "STALE" };
}

export function replaceIssueAnchor(
  anchor: Extract<IssueAnchor, { scope: "SELECTION" }>,
  replacement: string,
  nextRevision: number,
): Extract<IssueAnchor, { scope: "SELECTION" }> {
  return {
    ...anchor,
    rangeEnd: anchor.rangeStart + issuePointLength(replacement),
    selectedText: replacement,
    anchorRevision: nextRevision,
    anchorState: "ACTIVE",
  };
}
