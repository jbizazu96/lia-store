import {AdminOrderOperationsWorkspace} from "@/components/admin/AdminOrderOperationsWorkspace";
export default async function AdminOrderPage({params}: {params: Promise<{orderId: string}>}) { const {orderId} = await params; return <AdminOrderOperationsWorkspace orderId={orderId} />; }
