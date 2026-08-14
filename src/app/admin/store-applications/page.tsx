import {
  ApplicationReviewWorkspace,
} from "@/components/admin/ApplicationReviewWorkspace";

import type {AdminApplicationStatus} from "@/types/adminWorkspace";

const statuses = new Set<AdminApplicationStatus>(["pending_review", "approved", "rejected", "suspended"]);

export default async function AdminStoreApplicationsPage({searchParams}: {searchParams: Promise<{status?: string}>}) {
  const requested = (await searchParams).status as AdminApplicationStatus | undefined;
  return <ApplicationReviewWorkspace type="store" initialStatus={requested && statuses.has(requested) ? requested : "pending_review"} />;
}
