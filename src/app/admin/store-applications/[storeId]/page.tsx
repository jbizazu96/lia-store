import {
  ApplicationReviewWorkspace,
} from "@/components/admin/ApplicationReviewWorkspace";

export default async function AdminStoreApplicationDetailPage({
  params,
}: {
  params: Promise<{storeId: string}>;
}) {
  const {storeId} = await params;
  return <ApplicationReviewWorkspace type="store" applicationId={storeId} />;
}
