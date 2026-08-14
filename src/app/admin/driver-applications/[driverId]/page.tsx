import {
  ApplicationReviewWorkspace,
} from "@/components/admin/ApplicationReviewWorkspace";
import type {AdminApplicationStatus} from "@/types/adminWorkspace";

const statuses = new Set<AdminApplicationStatus>(["pending_review", "approved", "rejected", "suspended"]);

export default async function AdminDriverApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{driverId: string}>;
  searchParams: Promise<{from?: string}>;
}) {
  const {driverId} = await params;
  const requested = (await searchParams).from as AdminApplicationStatus | undefined;
  return <ApplicationReviewWorkspace type="driver" applicationId={driverId} initialStatus={requested && statuses.has(requested) ? requested : "pending_review"} />;
}
