import { DocumentWorkspaceEditor } from "@/components/document/document-workspace-editor";

/** Starts a new v3 shared note, then replaces this URL with its share route. */
export default function NewDocumentPage() {
  return <DocumentWorkspaceEditor launchOnMount />;
}
