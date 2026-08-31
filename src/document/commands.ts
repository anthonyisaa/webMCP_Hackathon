import {
  DOCUMENT_ACTION_PRESETS,
  type HumanAnnotationPresetId,
  type DocumentStage,
  type DocumentTargetKind,
} from "@/document/contracts";

export interface DocumentAgentCommand {
  presetId: HumanAnnotationPresetId;
  label: string;
  instruction: string | null;
}

export function getDocumentAgentCommands(stage: DocumentStage): DocumentAgentCommand[] {
  return [
    ...DOCUMENT_ACTION_PRESETS[stage].map((preset) => ({ ...preset })),
    { presetId: "custom" as const, label: "Ask agent…", instruction: null },
  ];
}

export function moveCommandIndex(
  currentIndex: number,
  direction: 1 | -1,
  commandCount: number,
): number {
  if (commandCount <= 0) return -1;
  const safeCurrent = currentIndex < 0 ? 0 : currentIndex % commandCount;
  return (safeCurrent + direction + commandCount) % commandCount;
}

export function documentTargetLabel(
  kind: DocumentTargetKind,
): "Selection" | "Caret" | "Document" {
  switch (kind) {
    case "SELECTION":
      return "Selection";
    case "CARET":
      return "Caret";
    case "DOCUMENT":
      return "Document";
  }
}
