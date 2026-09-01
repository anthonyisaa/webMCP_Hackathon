import { RepositoryApp } from "@/components/repository/RepositoryApp";

interface SharedIssuePageProps {
  params: Promise<{ shareToken: string }>;
}

export default async function SharedIssuePage({ params }: SharedIssuePageProps) {
  const { shareToken } = await params;
  return <RepositoryApp shareToken={shareToken} />;
}
