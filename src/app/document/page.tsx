import { DocumentEditor } from "@/components/document/document-editor";

/** Starts a new secondary shared note, then replaces this URL with its share route. */
export default function NewDocumentPage() {
  return <DocumentEditor launchOnMount />;
}
