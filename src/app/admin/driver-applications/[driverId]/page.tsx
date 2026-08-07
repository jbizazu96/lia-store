import {
  ApplicationReviewWorkspace,
} from "@/components/admin/ApplicationReviewWorkspace";

export default async function AdminDriverApplicationDetailPage({
  params,
}: {
  params: Promise<{driverId: string}>;
}) {
  const {driverId} = await params;
  return <ApplicationReviewWorkspace type="driver" applicationId={driverId} />;
}
