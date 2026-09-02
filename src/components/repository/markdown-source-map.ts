import type { IssueDocumentField } from "@/repository/contracts";

export interface RepositorySourceRange {
  startUtf16: number;
  endUtf16: number;
}

export interface RepositorySourceSelection {
  field: IssueDocumentField;
  rangeStart: number;
  rangeEnd: number;
  selectedText: string;
}

export interface RepositoryRenderedEndpoint extends RepositorySourceRange {
  leafText: string;
  leafOffsetUtf16: number;
}

function splitsSurrogatePair(value: string, offset: number): boolean {
  if (offset <= 0 || offset >= value.length) return false;
  const before = value.charCodeAt(offset - 1);
  const after = value.charCodeAt(offset);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

export function repositoryCodePointOffset(value: string, utf16Offset: number): number | null {
  if (!Number.isSafeInteger(utf16Offset) || utf16Offset < 0 || utf16Offset > value.length) {
    return null;
  }
  if (splitsSurrogatePair(value, utf16Offset)) return null;
  return Array.from(value.slice(0, utf16Offset)).length;
}

/** Map an exact DOM text leaf back into its bounded Markdown source range. */
export function mapExactRenderedEndpoint(
  source: string,
  endpoint: RepositoryRenderedEndpoint,
): number | null {
  const { startUtf16, endUtf16, leafText, leafOffsetUtf16 } = endpoint;
  if (
    !Number.isSafeInteger(startUtf16)
    || !Number.isSafeInteger(endUtf16)
    || startUtf16 < 0
    || endUtf16 > source.length
    || startUtf16 >= endUtf16
    || leafOffsetUtf16 < 0
    || leafOffsetUtf16 > leafText.length
    || splitsSurrogatePair(leafText, leafOffsetUtf16)
  ) return null;

  const boundedSource = source.slice(startUtf16, endUtf16);
  const first = boundedSource.indexOf(leafText);
  if (first < 0 || boundedSource.indexOf(leafText, first + 1) >= 0) return null;
  const leafStart = startUtf16 + first;
  if (source.at(leafStart - 1) === "\\") return null;
  if (source.at(leafStart) === "&" && /^&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/iu.test(source.slice(leafStart))) {
    return null;
  }
  const mapped = leafStart + leafOffsetUtf16;
  return splitsSurrogatePair(source, mapped) ? null : mapped;
}

export function mapRenderedEndpointsToSource(
  source: string,
  field: IssueDocumentField,
  start: RepositoryRenderedEndpoint,
  end: RepositoryRenderedEndpoint,
): RepositorySourceSelection | null {
  const startUtf16 = mapExactRenderedEndpoint(source, start);
  const endUtf16 = mapExactRenderedEndpoint(source, end);
  if (startUtf16 === null || endUtf16 === null || startUtf16 >= endUtf16) return null;
  return sourceRangeToSelection(source, field, startUtf16, endUtf16);
}

export function sourceRangeToSelection(
  source: string,
  field: IssueDocumentField,
  startUtf16: number,
  endUtf16: number,
): RepositorySourceSelection | null {
  if (startUtf16 >= endUtf16) return null;
  const rangeStart = repositoryCodePointOffset(source, startUtf16);
  const rangeEnd = repositoryCodePointOffset(source, endUtf16);
  if (rangeStart === null || rangeEnd === null || rangeStart >= rangeEnd) return null;
  const selectedText = source.slice(startUtf16, endUtf16);
  if (!selectedText.trim()) return null;
  return { field, rangeStart, rangeEnd, selectedText };
}

function sourceRangeFromElement(element: Element | null): RepositorySourceRange | null {
  if (!element) return null;
  const startUtf16 = Number(element.getAttribute("data-source-start"));
  const endUtf16 = Number(element.getAttribute("data-source-end"));
  if (!Number.isSafeInteger(startUtf16) || !Number.isSafeInteger(endUtf16)) return null;
  return { startUtf16, endUtf16 };
}

function exactEndpointFromDom(
  source: string,
  root: HTMLElement,
  container: Node,
  offset: number,
): number | null {
  if (container.nodeType !== Node.TEXT_NODE || !root.contains(container)) return null;
  const leaf = container as Text;
  const parent = leaf.parentElement;
  if (!parent || parent.closest('[data-selection-disabled="true"]')) return null;

  let candidate: Element | null = parent;
  while (candidate && root.contains(candidate)) {
    const sourceRange = sourceRangeFromElement(candidate);
    if (sourceRange) {
      const mapped = mapExactRenderedEndpoint(source, {
        ...sourceRange,
        leafText: leaf.data,
        leafOffsetUtf16: offset,
      });
      if (mapped !== null) return mapped;
    }
    candidate = candidate.parentElement;
  }
  return null;
}

/** Resolve a live browser selection only when both visible endpoints are exact source leaves. */
export function repositorySelectionFromDom(
  source: string,
  field: IssueDocumentField,
  root: HTMLElement,
  selection: Selection | null,
): RepositorySourceSelection | null {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const range = selection.getRangeAt(0);
  const startUtf16 = exactEndpointFromDom(source, root, range.startContainer, range.startOffset);
  const endUtf16 = exactEndpointFromDom(source, root, range.endContainer, range.endOffset);
  if (startUtf16 === null || endUtf16 === null) return null;
  return sourceRangeToSelection(source, field, startUtf16, endUtf16);
}
