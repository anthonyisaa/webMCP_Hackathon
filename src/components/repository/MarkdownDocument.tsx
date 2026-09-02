"use client";

import {
  Children,
  isValidElement,
  useMemo,
  useRef,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components, type ExtraProps, type UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

import type { IssueSelectionAnchor } from "@/repository/contracts";

import { ChartFigure } from "./ChartFigure";
import { parseRepositoryChart } from "./chart-spec";
import {
  repositoryCodePointOffset,
  repositorySelectionFromDom,
  sourceRangeToSelection,
  type RepositorySourceSelection,
} from "./markdown-source-map";
import styles from "./repository-workspace.module.css";

const ALLOWED_ELEMENTS = [
  "a", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "img", "input", "li", "ol", "p", "pre", "section", "strong", "sup", "table", "tbody",
  "td", "th", "thead", "tr", "ul",
] as const;

interface SourcePosition {
  start: { offset?: number };
  end: { offset?: number };
}

function nodeRange(node: ExtraProps["node"]): { startUtf16: number; endUtf16: number } | null {
  const position = node?.position as SourcePosition | undefined;
  const startUtf16 = position?.start.offset;
  const endUtf16 = position?.end.offset;
  if (!Number.isSafeInteger(startUtf16) || !Number.isSafeInteger(endUtf16)) return null;
  return { startUtf16: startUtf16!, endUtf16: endUtf16! };
}

function safeUrlTransform(url: string): ReturnType<UrlTransform> {
  if (url.startsWith("#") || url.startsWith("/")) return url;
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? url : "";
  } catch {
    return "";
  }
}

function chartChild(children: ReactNode): { source: string } | null {
  const only = Children.count(children) === 1 ? Children.only(children) : null;
  if (!isValidElement<{ className?: string; children?: ReactNode }>(only)) return null;
  if (only.props.className !== "language-chart") return null;
  return { source: String(only.props.children ?? "").replace(/\n$/u, "") };
}

export interface MarkdownSelectionEvent extends RepositorySourceSelection {
  rect: DOMRect;
}

export interface MarkdownDocumentProps {
  source: string;
  /** Absolute code-point offset when rendering one slice of a larger immutable source. */
  sourceCodePointOffset?: number;
  /** Omit when an ancestor represents multiple rendered source slices as one test surface. */
  testId?: string | null;
  anchors?: readonly IssueSelectionAnchor[];
  onSelectSource?: (selection: MarkdownSelectionEvent) => void;
  className?: string;
}

function rangeOverlapsAnchor(
  source: string,
  range: { startUtf16: number; endUtf16: number } | null,
  anchors: readonly IssueSelectionAnchor[],
  sourceCodePointOffset: number,
): boolean {
  if (!range) return false;
  const start = repositoryCodePointOffset(source, range.startUtf16);
  const end = repositoryCodePointOffset(source, range.endUtf16);
  if (start === null || end === null) return false;
  const absoluteStart = start + sourceCodePointOffset;
  const absoluteEnd = end + sourceCodePointOffset;
  return anchors.some((anchor) => anchor.field === "BODY" && anchor.rangeStart < absoluteEnd && anchor.rangeEnd > absoluteStart);
}

function sourceAttributes(
  source: string,
  node: ExtraProps["node"],
  anchors: readonly IssueSelectionAnchor[],
  sourceCodePointOffset: number,
) {
  const range = nodeRange(node);
  return range ? {
    "data-source-start": range.startUtf16,
    "data-source-end": range.endUtf16,
    "data-commented": rangeOverlapsAnchor(source, range, anchors, sourceCodePointOffset) ? "true" : undefined,
  } : {};
}

function blockSelection(
  source: string,
  range: { startUtf16: number; endUtf16: number } | null,
  element: HTMLElement,
  sourceCodePointOffset: number,
  onSelectSource?: (selection: MarkdownSelectionEvent) => void,
) {
  if (!range || !onSelectSource) return;
  const selection = sourceRangeToSelection(source, "BODY", range.startUtf16, range.endUtf16);
  if (selection) onSelectSource({
    ...selection,
    rangeStart: selection.rangeStart + sourceCodePointOffset,
    rangeEnd: selection.rangeEnd + sourceCodePointOffset,
    rect: element.getBoundingClientRect(),
  });
}

function createComponents(
  source: string,
  anchors: readonly IssueSelectionAnchor[],
  sourceCodePointOffset: number,
  onSelectSource?: (selection: MarkdownSelectionEvent) => void,
): Components {
  type BlockProps<Tag extends keyof React.JSX.IntrinsicElements> = ComponentPropsWithoutRef<Tag> & ExtraProps;
  const attributes = (node: ExtraProps["node"]) => sourceAttributes(source, node, anchors, sourceCodePointOffset);

  return {
    h1: ({ node, ...props }: BlockProps<"h1">) => <h1 {...attributes(node)} {...props} />,
    h2: ({ node, ...props }: BlockProps<"h2">) => <h2 {...attributes(node)} {...props} />,
    h3: ({ node, ...props }: BlockProps<"h3">) => <h3 {...attributes(node)} {...props} />,
    h4: ({ node, ...props }: BlockProps<"h4">) => <h4 {...attributes(node)} {...props} />,
    h5: ({ node, ...props }: BlockProps<"h5">) => <h5 {...attributes(node)} {...props} />,
    h6: ({ node, ...props }: BlockProps<"h6">) => <h6 {...attributes(node)} {...props} />,
    p: ({ node, ...props }: BlockProps<"p">) => <p {...attributes(node)} {...props} />,
    li: ({ node, ...props }: BlockProps<"li">) => <li {...attributes(node)} {...props} />,
    blockquote: ({ node, ...props }: BlockProps<"blockquote">) => <blockquote {...attributes(node)} {...props} />,
    strong: ({ node, ...props }: BlockProps<"strong">) => <strong {...attributes(node)} {...props} />,
    em: ({ node, ...props }: BlockProps<"em">) => <em {...attributes(node)} {...props} />,
    del: ({ node, ...props }: BlockProps<"del">) => <del {...attributes(node)} {...props} />,
    a: ({ node, href, children, ...props }: BlockProps<"a">) => href ? (
      <a
        {...attributes(node)}
        {...props}
        href={href}
        rel={href.startsWith("/") || href.startsWith("#") ? undefined : "noreferrer noopener"}
        target={href.startsWith("/") || href.startsWith("#") ? undefined : "_blank"}
      >{children}</a>
    ) : <span {...attributes(node)}>{children}</span>,
    img: ({ alt, node }: BlockProps<"img">) => (
      <span {...attributes(node)} className={styles.inertImage} data-selection-disabled="true">
        Image omitted{alt ? ` · ${alt}` : ""}
      </span>
    ),
    input: ({ node, ...props }: BlockProps<"input">) => <input {...attributes(node)} {...props} disabled tabIndex={-1} />,
    code: ({ node, ...props }: BlockProps<"code">) => <code {...attributes(node)} {...props} data-selection-disabled="true" />,
    sup: ({ node, ...props }: BlockProps<"sup">) => <sup {...attributes(node)} {...props} data-selection-disabled="true" />,
    pre: ({ node, children }: BlockProps<"pre">) => {
      const range = nodeRange(node);
      const chart = chartChild(children);
      if (chart) {
        const parsed = parseRepositoryChart(chart.source);
        return (
          <div {...attributes(node)} className={styles.chartBlock} data-selection-disabled="true">
            {parsed.ok ? (
              <ChartFigure
                chart={parsed.value}
                onSelectSource={onSelectSource && range
                  ? (element) => blockSelection(source, range, element, sourceCodePointOffset, onSelectSource)
                  : undefined}
              />
            ) : (
              <div className={styles.chartError} role="note">
                <strong>Chart could not be rendered</strong>
                <span>{parsed.error} Open Edit to correct the source.</span>
              </div>
            )}
          </div>
        );
      }
      return <pre {...attributes(node)} data-selection-disabled="true">{children}</pre>;
    },
    table: ({ node, children }: BlockProps<"table">) => {
      const range = nodeRange(node);
      return (
        <div {...attributes(node)} className={styles.markdownTable}>
          <div className={styles.tableActions} data-selection-disabled="true">
            <span>Table</span>
            {onSelectSource && range ? (
              <button type="button" onClick={(event) => blockSelection(source, range, event.currentTarget.closest(`.${styles.markdownTable}`) as HTMLElement, sourceCodePointOffset, onSelectSource)}>
                Comment on table
              </button>
            ) : null}
          </div>
          <div className={styles.tableScroll}><table>{children}</table></div>
        </div>
      );
    },
    th: ({ node, ...props }: BlockProps<"th">) => <th {...attributes(node)} {...props} />,
    td: ({ node, ...props }: BlockProps<"td">) => <td {...attributes(node)} {...props} />,
  };
}

/** Safe GFM reading view that keeps exact raw-source positions for anchored comments. */
export function MarkdownDocument({ source, sourceCodePointOffset = 0, testId = "rendered-document-body", anchors = [], onSelectSource, className }: MarkdownDocumentProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const components = useMemo(
    () => createComponents(source, anchors, sourceCodePointOffset, onSelectSource),
    [anchors, onSelectSource, source, sourceCodePointOffset],
  );

  const captureSelection = (event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => {
    if (!onSelectSource || !rootRef.current) return;
    const mapped = repositorySelectionFromDom(source, "BODY", rootRef.current, window.getSelection());
    if (!mapped) return;
    const browserSelection = window.getSelection();
    if (!browserSelection || browserSelection.rangeCount !== 1) return;
    onSelectSource({
      ...mapped,
      rangeStart: mapped.rangeStart + sourceCodePointOffset,
      rangeEnd: mapped.rangeEnd + sourceCodePointOffset,
      rect: browserSelection.getRangeAt(0).getBoundingClientRect(),
    });
    event.stopPropagation();
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.markdownDocument}${className ? ` ${className}` : ""}`}
      data-testid={testId ?? undefined}
      onMouseUp={captureSelection}
      onKeyUp={(event) => {
        if (event.shiftKey || event.key === "Enter") captureSelection(event);
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        allowedElements={[...ALLOWED_ELEMENTS]}
        skipHtml
        unwrapDisallowed={false}
        urlTransform={safeUrlTransform}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
