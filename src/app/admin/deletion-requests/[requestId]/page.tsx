import {
  AccountDeletionReviewWorkspace,
} from "@/components/admin/AccountDeletionReviewWorkspace";

export default async function AdminDeletionRequestPage({
  params,
}: {
  params: Promise<{
    requestId: string;
  }>;
}) {
  const {
    requestId,
  } = await params;

  return <AccountDeletionReviewWorkspace requestId={requestId} />;
}
