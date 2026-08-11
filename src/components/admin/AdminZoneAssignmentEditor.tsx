"use client";

import {useEffect, useState} from "react";
import {LoaderCircle, MapPinned} from "lucide-react";
import {adminWorkspaceClientService} from "@/services/admin/adminWorkspaceClientService";
import type {DeliveryZone} from "@/types/deliveryZone";

interface Props {
  accountType: "customer" | "store" | "driver";
  accountId: string;
  homeZoneId: string | null;
  serviceZoneIds?: string[];
  orderZoneIds?: string[];
  disabled?: boolean;
  onSaved: () => Promise<void>;
}

export function AdminZoneAssignmentEditor({
  accountType,
  accountId,
  homeZoneId,
  serviceZoneIds = [],
  orderZoneIds = [],
  disabled = false,
  onSaved,
}: Props) {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [home, setHome] = useState(homeZoneId ?? "");
  const [services, setServices] = useState<string[]>(serviceZoneIds);
  const [orders, setOrders] = useState<string[]>(orderZoneIds);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void adminWorkspaceClientService.getDeliveryZones()
      .then((result) => setZones(result.zones.filter((zone) => zone.isActive)))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Unable to load delivery zones."));
  }, []);

  const toggleService = (zoneId: string) => {
    setServices((current) => current.includes(zoneId)
      ? current.filter((id) => id !== zoneId)
      : [...current, zoneId]);
    setMessage("");
  };

  const toggleOrder = (zoneId: string) => {
    setOrders((current) => current.includes(zoneId)
      ? current.filter((id) => id !== zoneId)
      : [...current, zoneId]);
    setMessage("");
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await adminWorkspaceClientService.setAccountZoneAssignment({
        accountType,
        accountId,
        homeZoneId: home || null,
        serviceZoneIds: accountType === "customer" ? [] : services.filter((id) => id !== home),
        orderZoneIds: accountType === "customer" ? orders.filter((id) => id !== home) : [],
      });
      await onSaved();
      setMessage("Zone assignment saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save zone assignment.");
    } finally {
      setSaving(false);
    }
  };

  return <section className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
    <div className="flex items-start gap-3"><MapPinned className="mt-0.5 h-5 w-5 text-blue-700"/><div><h3 className="font-bold text-slate-900">Zone assignment</h3><p className="mt-1 text-sm text-slate-600">Address matching assigns the home zone automatically. Only administrators can override it{accountType === "customer" ? " or approve additional order zones after a support request." : " or add service zones."}</p></div></div>
    <label className="mt-4 block text-sm font-bold text-slate-700">Home zone
      <select value={home} onChange={(event) => {setHome(event.target.value); setServices((current) => current.filter((id) => id !== event.target.value)); setOrders((current) => current.filter((id) => id !== event.target.value)); setMessage("");}} disabled={disabled || saving} className="mt-2 block w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 font-medium outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50">
        <option value="">Default customer pricing — no matched zone</option>
        {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name} ({zone.primaryStateCode})</option>)}
      </select>
    </label>
    {accountType !== "customer" && <div className="mt-4"><p className="text-sm font-bold text-slate-700">Additional service zones</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{zones.filter((zone) => zone.id !== home).map((zone) => <label key={zone.id} className="flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={services.includes(zone.id)} onChange={() => toggleService(zone.id)} disabled={disabled || saving}/>{zone.name}</label>)}</div></div>}
    {accountType === "customer" && <div className="mt-4"><p className="text-sm font-bold text-slate-700">Approved order zones</p><p className="mt-1 text-xs text-slate-500">Allows this customer to order from stores in these zones. Pricing comes from the order zone and still uses the actual route miles.</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{zones.filter((zone) => zone.id !== home).map((zone) => <label key={zone.id} className="flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={orders.includes(zone.id)} onChange={() => toggleOrder(zone.id)} disabled={disabled || saving}/>{zone.name}</label>)}</div></div>}
    {message && <p className={`mt-3 text-sm ${message === "Zone assignment saved." ? "text-green-700" : "text-red-700"}`}>{message}</p>}
    <div className="mt-4 flex justify-end"><button type="button" disabled={disabled || saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving && <LoaderCircle className="h-4 w-4 animate-spin"/>}{saving ? "Saving…" : "Save zone assignment"}</button></div>
  </section>;
}
