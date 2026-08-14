import {
  ApplicationReviewWorkspace,
} from "@/components/admin/ApplicationReviewWorkspace";
import type {AdminApplicationStatus} from "@/types/adminWorkspace";

const statuses = new Set<AdminApplicationStatus>(["pending_review", "approved", "rejected", "suspended"]);

export default async function AdminStoreApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{storeId: string}>;
  searchParams: Promise<{from?: string}>;
}) {
  const {storeId} = await params;
  const requested = (await searchParams).from as AdminApplicationStatus | undefined;
  return <ApplicationReviewWorkspace type="store" applicationId={storeId} initialStatus={requested && statuses.has(requested) ? requested : "pending_review"} />;
}
