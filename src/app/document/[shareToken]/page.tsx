import { DocumentEditor } from "@/components/document/document-editor";

interface SharedDocumentPageProps {
  params: Promise<{ shareToken: string }>;
}

export default async function SharedDocumentPage({ params }: SharedDocumentPageProps) {
  const { shareToken } = await params;
  return <DocumentEditor shareToken={shareToken} />;
}
