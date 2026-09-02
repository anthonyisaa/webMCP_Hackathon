import { MANAGED_RELAY_EXAMPLE_OVERLAYS } from "@/domain/repository-examples";
import type { IssueDocumentKind } from "@/repository/contracts";

export type LivingDocumentSheet = {
  sheetNumber: 1 | 2;
  sheetCount: 2;
  ariaLabel: "Page 1 of 2" | "Page 2 of 2";
  markdown: string;
};

function assertSingleBreak(body: string, heading: string): number {
  const marker = `\n${heading}\n`;
  const first = body.indexOf(marker);
  if (first < 0 || body.indexOf(marker, first + marker.length) >= 0) {
    throw new Error(`Living document must contain exactly one ${heading} sheet break.`);
  }
  return first;
}
/**
 * Splits one immutable Markdown source into the two visual sheets used by the demo.
 * Joining `sheet[0].markdown + "\n" + sheet[1].markdown` reproduces the source exactly.
 */
export function splitLivingDocumentIntoSheets(
  kind: IssueDocumentKind,
  body: string,
): readonly [LivingDocumentSheet, LivingDocumentSheet] {
  const fixture = MANAGED_RELAY_EXAMPLE_OVERLAYS[kind];
  const splitAt = assertSingleBreak(body, fixture.sheetBreakHeading);

  return [
    {
      sheetNumber: 1,
      sheetCount: 2,
      ariaLabel: "Page 1 of 2",
      markdown: body.slice(0, splitAt),
    },
    {
      sheetNumber: 2,
      sheetCount: 2,
      ariaLabel: "Page 2 of 2",
      markdown: body.slice(splitAt + 1),
    },
  ];
}
