import {AdminCustomerPricingWorkspace} from "@/components/admin/AdminCustomerPricingWorkspace";

interface DeliveryZonePricingPageProps {
  params: Promise<{zoneId: string}>;
}

export default async function DeliveryZonePricingPage({params}: DeliveryZonePricingPageProps) {
  const {zoneId} = await params;
  return <AdminCustomerPricingWorkspace zoneId={zoneId} />;
}
