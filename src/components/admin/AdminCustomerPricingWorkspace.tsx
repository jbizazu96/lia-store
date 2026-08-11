"use client";

import Link from "next/link";
import {useCallback, useEffect, useState} from "react";
import {ArrowLeft, LoaderCircle, RotateCcw} from "lucide-react";
import {adminWorkspaceClientService} from "@/services/admin/adminWorkspaceClientService";

interface MarketplacePricingPolicy {
  maxRadiusMiles: number;
  baseDeliveryFeeCents: number;
  baseDistanceMiles: number;
  costPerMileCents: number;
  peakSurchargeCents: number;
  freeDeliveryMinimumCents: number;
  defaultMinimumOrderCents: number;
  serviceFeeRate: number;
  minimumServiceFeeCents: number;
  maximumServiceFeeCents: number;
  salesTaxRate: number;
  freeDeliveryDriverIncentiveWithoutTipCents: number;
  freeDeliveryDriverIncentiveWithTipCents: number;
}

type EditablePricingField = keyof MarketplacePricingPolicy;

interface FieldDefinition {
  key: EditablePricingField;
  label: string;
  hint: string;
  unit: "$" | "%" | "miles";
}

const SECTIONS: Array<{title: string; description: string; fields: FieldDefinition[]}> = [
  {
    title: "Delivery pricing",
    description: "Used for route-based delivery estimates before checkout.",
    fields: [
      {key: "maxRadiusMiles", label: "Maximum delivery radius", hint: "Orders beyond this route distance cannot checkout.", unit: "miles"},
      {key: "baseDeliveryFeeCents", label: "Base delivery fee", hint: "Fee charged within the base distance.", unit: "$"},
      {key: "baseDistanceMiles", label: "Base delivery distance", hint: "Miles covered by the base fee.", unit: "miles"},
      {key: "costPerMileCents", label: "Additional cost per mile", hint: "Applied after the base distance.", unit: "$"},
      {key: "peakSurchargeCents", label: "Peak delivery surcharge", hint: "Added only when the delivery calculator marks a peak period.", unit: "$"},
      {key: "freeDeliveryMinimumCents", label: "Free-delivery order threshold", hint: "Subtotal required for delivery to be free.", unit: "$"},
    ],
  },
  {
    title: "Customer fees and tax",
    description: "Shown in the customer cart and trusted again during checkout.",
    fields: [
      {key: "serviceFeeRate", label: "Service fee rate", hint: "Percentage of the product subtotal.", unit: "%"},
      {key: "minimumServiceFeeCents", label: "Minimum service fee", hint: "The lowest service fee charged.", unit: "$"},
      {key: "maximumServiceFeeCents", label: "Maximum service fee", hint: "The highest service fee charged.", unit: "$"},
      {key: "salesTaxRate", label: "Estimated sales tax rate", hint: "An estimate shown before the final Stripe Tax calculation.", unit: "%"},
      {key: "defaultMinimumOrderCents", label: "Default minimum order", hint: "Used unless a store has its own approved minimum order.", unit: "$"},
    ],
  },
  {
    title: "Free-delivery driver incentive",
    description: "Paid from LIA’s commission after a completed delivery, never from a customer tip.",
    fields: [
      {key: "freeDeliveryDriverIncentiveWithoutTipCents", label: "Incentive without a tip", hint: "Driver incentive when a qualifying free-delivery order has no tip.", unit: "$"},
      {key: "freeDeliveryDriverIncentiveWithTipCents", label: "Incentive with a tip", hint: "Driver incentive when the customer also leaves a tip.", unit: "$"},
    ],
  },
];

function toDisplay(value: number, unit: FieldDefinition["unit"]): string {
  if (unit === "$") return (value / 100).toFixed(2);
  if (unit === "%") return (value * 100).toFixed(2);
  return String(value);
}

function toStored(value: string, unit: FieldDefinition["unit"]): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (unit === "$") return Math.round(amount * 100);
  if (unit === "%") return amount / 100;
  return Number.isInteger(amount) ? amount : null;
}

interface ZonePricingScope {
  id: string;
  name: string;
  primaryStateCode: string;
  maximumRouteMiles: number;
}

export function AdminCustomerPricingWorkspace({zoneId}: {zoneId?: string}) {
  const [policy, setPolicy] = useState<MarketplacePricingPolicy | null>(null);
  const [draft, setDraft] = useState<Record<EditablePricingField, string> | null>(null);
  const [zone, setZone] = useState<ZonePricingScope | null>(null);
  const [inherited, setInherited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      let loaded: MarketplacePricingPolicy;
      if (zoneId) {
        const result = await adminWorkspaceClientService.getDeliveryZonePricing(zoneId);
        loaded = result.policy as unknown as MarketplacePricingPolicy;
        setZone(result.zone);
        setInherited(result.inherited);
      } else {
        const result = await adminWorkspaceClientService.getMarketplacePricingPolicy();
        loaded = (result.policy ?? {}) as unknown as MarketplacePricingPolicy;
        setZone(null);
        setInherited(false);
      }
      setPolicy(loaded);
      setDraft(Object.fromEntries(
        SECTIONS.flatMap((section) => section.fields).map((field) => [
          field.key,
          typeof loaded[field.key] === "number"
            ? toDisplay(loaded[field.key], field.unit)
            : "",
        ]),
      ) as Record<EditablePricingField, string>);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load customer pricing.");
    }
  }, [zoneId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const save = async () => {
    if (!draft || !policy) return;
    const next = {...policy};

    for (const section of SECTIONS) {
      for (const field of section.fields) {
        const value = toStored(draft[field.key], field.unit);
        if (value === null) {
          setError(`Enter a valid ${field.label.toLowerCase()}.`);
          return;
        }
        next[field.key] = value;
      }
    }

    setSaving(true);
    setError("");
    setSaved(false);
    try {
      if (zoneId) {
        await adminWorkspaceClientService.saveDeliveryZonePricing(zoneId, next);
      } else {
        await adminWorkspaceClientService.saveMarketplacePricingPolicy(next);
      }
      setSaved(true);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save customer pricing.");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async () => {
    if (!zoneId || !window.confirm("Reset this zone to the default customer pricing?")) return;
    setResetting(true);
    setError("");
    setSaved(false);
    try {
      await adminWorkspaceClientService.resetDeliveryZonePricing(zoneId);
      await load();
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to reset zone pricing.");
    } finally {
      setResetting(false);
    }
  };

  if (!policy || !draft) {
    return <div className="flex min-h-64 items-center justify-center">
      {error ? <p className="text-red-700">{error}</p> : <LoaderCircle className="h-8 w-8 animate-spin text-orange-600"/>}
    </div>;
  }

  return <section>
    <Link href={zoneId ? "/admin/delivery-zones" : "/admin/settings"} className="mb-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
      <ArrowLeft className="h-4 w-4"/>{zoneId ? "Back to delivery zones" : "Back to settings"}
    </Link>
    <p className="text-sm font-bold tracking-wide text-orange-600">{zoneId ? "ZONE CUSTOMER PRICING" : "DEFAULT CUSTOMER PRICING"}</p>
    <h1 className="mt-1 text-3xl font-bold">{zone ? `${zone.name} pricing` : "Default customer pricing"}</h1>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
      {zone
        ? `Pricing configuration for ${zone.name}, ${zone.primaryStateCode}. The ${zone.maximumRouteMiles}-mile maximum comes from the zone settings.`
        : "This fallback pricing is used when the store address or customer address is not assigned to a delivery zone. Route distance is still calculated and must remain within the maximum delivery distance."}
    </p>
    {zoneId && (
      <div className={"mt-4 rounded-xl p-3 text-sm font-semibold " + (inherited ? "bg-blue-50 text-blue-800" : "bg-orange-50 text-orange-800")}>
        {inherited
          ? "This zone currently inherits the default customer pricing. Saving creates a zone-specific policy."
          : "This zone has its own customer-pricing policy."}
      </div>
    )}
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {saved && <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">Customer pricing policy saved and audited.</p>}
    <div className="mt-6 space-y-5">
      {SECTIONS.map((section) => <section key={section.title} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h2 className="font-bold text-slate-950">{section.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{section.description}</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {section.fields.map((field) => <label key={field.key} className="block text-sm font-semibold text-slate-800">
            {field.label}
            <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{field.hint}</span>
            <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-orange-200">
              <input type="number" min="0" step={field.unit === "miles" ? "1" : "0.01"} value={draft[field.key]} disabled={Boolean(zoneId && field.key === "maxRadiusMiles")} onChange={(event) => { setSaved(false); setDraft({...draft, [field.key]: event.target.value}); }} className="min-w-0 flex-1 px-3 py-2.5 outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"/>
              <span className="border-l border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-500">{field.unit}</span>
            </div>
          </label>)}
        </div>
      </section>)}
    </div>
    <div className="sticky bottom-4 mt-6 flex flex-wrap justify-end gap-3 rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-slate-200 backdrop-blur">
      {zoneId && !inherited && (
        <button disabled={saving || resetting} onClick={() => void resetToDefaults()} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200 disabled:opacity-50">
          <RotateCcw className="h-4 w-4" />{resetting ? "Resetting…" : "Use default pricing"}
        </button>
      )}
      <button disabled={saving || resetting} onClick={() => void save()} className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : zoneId ? "Save zone pricing" : "Save default pricing"}</button>
    </div>
  </section>;
}
