import { DocumentWorkspaceEditor } from "@/components/document/document-workspace-editor";

interface SharedDocumentPageProps {
  params: Promise<{ shareToken: string }>;
}

export default async function SharedDocumentPage({ params }: SharedDocumentPageProps) {
  const { shareToken } = await params;
  return <DocumentWorkspaceEditor shareToken={shareToken} />;
}
