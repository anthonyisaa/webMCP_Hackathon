import { DocumentWorkspaceEditor } from "@/components/document/document-workspace-editor";

interface SharedDocumentPageProps {
  params: Promise<{ shareToken: string }>;
  searchParams: Promise<{ example?: string | string[] }>;
}

export default async function SharedDocumentPage({
  params,
  searchParams,
}: SharedDocumentPageProps) {
  const { shareToken } = await params;
  const { example } = await searchParams;
  return (
    <DocumentWorkspaceEditor
      exampleMode={example === "1"}
      shareToken={shareToken}
    />
  );
}
