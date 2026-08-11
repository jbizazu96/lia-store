"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";
import {
  CircleDollarSign,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  adminWorkspaceClientService,
} from "@/services/admin/adminWorkspaceClientService";
import type {
  DeliveryZone,
  DeliveryZoneDraft,
} from "@/types/deliveryZone";

const STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC", "PR",
] as const;

const TIME_ZONES = [
  {value: "America/New_York", label: "Eastern — America/New_York"},
  {value: "America/Chicago", label: "Central — America/Chicago"},
  {value: "America/Denver", label: "Mountain — America/Denver"},
  {value: "America/Phoenix", label: "Arizona — America/Phoenix"},
  {value: "America/Los_Angeles", label: "Pacific — America/Los_Angeles"},
  {value: "America/Anchorage", label: "Alaska — America/Anchorage"},
  {value: "America/Adak", label: "Aleutian — America/Adak"},
  {value: "Pacific/Honolulu", label: "Hawaii — Pacific/Honolulu"},
  {value: "America/Puerto_Rico", label: "Atlantic — America/Puerto_Rico"},
] as const;

function blankZone(): DeliveryZoneDraft {
  return {
    name: "",
    description: "",
    primaryStateCode: "IA",
    timeZone: "America/Chicago",
    maximumRouteMiles: 25,
    isActive: false,
    postalCodes: [],
    placeIds: [],
  };
}

function zoneDraft(zone: DeliveryZone): DeliveryZoneDraft {
  return {
    name: zone.name,
    description: zone.description ?? "",
    primaryStateCode: zone.primaryStateCode,
    timeZone: zone.timeZone,
    maximumRouteMiles: zone.maximumRouteMiles,
    isActive: zone.isActive,
    postalCodes: zone.postalCodes,
    placeIds: zone.placeIds,
  };
}

export function AdminDeliveryZonesWorkspace() {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState<DeliveryZoneDraft | null>(null);
  const [cityName, setCityName] = useState("");
  const [cityStateCode, setCityStateCode] = useState("IA");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [citySaving, setCitySaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedZone = editingId
    ? zones.find((zone) => zone.id === editingId) ?? null
    : null;

  const load = async (): Promise<DeliveryZone[]> => {
    setLoading(true);
    try {
      const loaded = (await adminWorkspaceClientService.getDeliveryZones()).zones;
      setZones(loaded);
      return loaded;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load delivery zones.");
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  const beginCreate = () => {
    setError("");
    setSuccess("");
    setEditingId(null);
    setDraft(blankZone());
    setCityName("");
    setCityStateCode("IA");
  };

  const beginEdit = (zone: DeliveryZone) => {
    setError("");
    setSuccess("");
    setEditingId(zone.id);
    setDraft(zoneDraft(zone));
    setCityName("");
    setCityStateCode(zone.primaryStateCode);
  };

  const closeEditor = () => {
    setEditingId(undefined);
    setDraft(null);
    setCityName("");
    setError("");
  };

  const saveZone = async () => {
    if (!draft) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (editingId) {
        await adminWorkspaceClientService.updateDeliveryZone(editingId, draft);
        await load();
        closeEditor();
        setSuccess("Delivery zone updated.");
      } else {
        await adminWorkspaceClientService.createDeliveryZone(draft);
        await load();
        closeEditor();
        setSuccess("Zone created. Open Edit when you are ready to add its cities.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the delivery zone.");
    } finally {
      setSaving(false);
    }
  };

  const addCity = async () => {
    if (!editingId || !cityName.trim()) return;
    setCitySaving(true);
    setError("");
    setSuccess("");
    try {
      await adminWorkspaceClientService.addDeliveryZoneCity(
        editingId,
        cityName,
        cityStateCode,
      );
      setCityName("");
      await load();
      setSuccess("City added to the delivery zone.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to add the city.");
    } finally {
      setCitySaving(false);
    }
  };

  const removeCity = async (cityKey: string, label: string) => {
    if (!editingId || !window.confirm(`Remove ${label} from this delivery zone?`)) return;
    setError("");
    setSuccess("");
    try {
      await adminWorkspaceClientService.removeDeliveryZoneCity(editingId, cityKey);
      await load();
      setSuccess("City removed from the delivery zone.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to remove the city.");
    }
  };

  const deleteZone = async (zone: DeliveryZone) => {
    if (!window.confirm(`Delete ${zone.name}? This cannot be undone.`)) return;
    setError("");
    setSuccess("");
    try {
      await adminWorkspaceClientService.deleteDeliveryZone(zone.id);
      if (editingId === zone.id) closeEditor();
      await load();
      setSuccess("Delivery zone deleted.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete the delivery zone.");
    }
  };

  const backfillAssignments = async () => {
    if (!window.confirm("Assign active delivery zones to existing customers, stores, and drivers? Existing admin assignments will be preserved.")) return;
    setBackfilling(true);
    setError("");
    setSuccess("");
    try {
      const result = await adminWorkspaceClientService.backfillDeliveryZoneAssignments();
      setSuccess(
        `Assignment complete: ${result.customers.matched}/${result.customers.scanned} customers, ` +
        `${result.stores.matched}/${result.stores.scanned} stores, and ` +
        `${result.drivers.matched}/${result.drivers.scanned} drivers matched active zones. ` +
        "Unmatched accounts use Default Customer Pricing.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to assign existing accounts.");
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold tracking-wide text-orange-600">DELIVERY OPERATIONS</p>
          <h1 className="mt-1 text-3xl font-bold">Delivery zones</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Group nearby cities into one marketplace service area. A customer must be in a city
            served by the store&apos;s zone and within the trusted driving-distance limit before checkout.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void backfillAssignments()}
            disabled={backfilling}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${backfilling ? "animate-spin" : ""}`} />
            {backfilling ? "Assigning…" : "Assign existing accounts"}
          </button>
          <button
            type="button"
            onClick={beginCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" />
            Create zone
          </button>
        </div>
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      {success && <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-700">{success}</p>}

      {draft && (
        <ZoneEditor
          draft={draft}
          setDraft={setDraft}
          selectedZone={selectedZone}
          cityName={cityName}
          setCityName={setCityName}
          cityStateCode={cityStateCode}
          setCityStateCode={setCityStateCode}
          saving={saving}
          citySaving={citySaving}
          error={error}
          success={success}
          onSave={() => void saveZone()}
          onClose={closeEditor}
          onAddCity={() => void addCity()}
          onRemoveCity={(key, label) => void removeCity(key, label)}
        />
      )}

      <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500">Loading delivery zones…</p>
        ) : zones.length === 0 ? (
          <div className="p-10 text-center">
            <MapPin className="mx-auto h-9 w-9 text-orange-500" />
            <p className="mt-3 font-bold">No delivery zones yet</p>
            <p className="mt-1 text-sm text-slate-500">Create the first marketplace service area, then add its cities.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {zones.map((zone) => (
              <article key={zone.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span className={"h-3 w-3 rounded-full " + (zone.isActive ? "bg-green-500" : "bg-slate-300")} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{zone.name}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                      {zone.primaryStateCode}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {zone.cities.length} {zone.cities.length === 1 ? "city" : "cities"} · Under {zone.maximumRouteMiles} route miles · {zone.timeZone}
                  </p>
                  {zone.cities.length > 0 && (
                    <p className="mt-1 truncate text-xs text-slate-400">
                      {zone.cities.map((city) => `${city.name}, ${city.stateCode}`).join(" · ")}
                    </p>
                  )}
                </div>
                <Link
                  href={`/admin/delivery-zones/${zone.id}/pricing`}
                  className="rounded-lg p-2.5 text-orange-600 hover:bg-orange-50"
                  aria-label={`Edit customer pricing for ${zone.name}`}
                  title="Customer pricing"
                >
                  <CircleDollarSign className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => beginEdit(zone)}
                  className="rounded-lg p-2.5 text-slate-600 hover:bg-slate-100"
                  aria-label={`Edit ${zone.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void deleteZone(zone)}
                  className="rounded-lg p-2.5 text-red-600 hover:bg-red-50"
                  aria-label={`Delete ${zone.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ZoneEditor({
  draft,
  setDraft,
  selectedZone,
  cityName,
  setCityName,
  cityStateCode,
  setCityStateCode,
  saving,
  citySaving,
  error,
  success,
  onSave,
  onClose,
  onAddCity,
  onRemoveCity,
}: {
  draft: DeliveryZoneDraft;
  setDraft: (draft: DeliveryZoneDraft) => void;
  selectedZone: DeliveryZone | null;
  cityName: string;
  setCityName: (value: string) => void;
  cityStateCode: string;
  setCityStateCode: (value: string) => void;
  saving: boolean;
  citySaving: boolean;
  error: string;
  success: string;
  onSave: () => void;
  onClose: () => void;
  onAddCity: () => void;
  onRemoveCity: (key: string, label: string) => void;
}) {
  const change = <K extends keyof DeliveryZoneDraft>(key: K, value: DeliveryZoneDraft[K]) =>
    setDraft({...draft, [key]: value});

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="delivery-zone-editor-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5 sm:p-6"
      >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="delivery-zone-editor-title" className="text-lg font-bold">{selectedZone ? `Edit ${selectedZone.name}` : "Create delivery zone"}</h2>
          <p className="mt-1 text-xs text-slate-500">
            Create the zone first. City management becomes available after it has been saved.
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close zone editor">
          <X className="h-5 w-5" />
        </button>
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      {success && <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-700">{success}</p>}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Zone name" value={draft.name} placeholder="Iowa City Area" onChange={(value) => change("name", value)} />
        <label className="text-sm font-bold">
          Primary state
          <select value={draft.primaryStateCode} onChange={(event) => change("primaryStateCode", event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
            {STATE_CODES.map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
        </label>
        <label className="text-sm font-bold">
          Time zone
          <select value={draft.timeZone} onChange={(event) => change("timeZone", event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
            {TIME_ZONES.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
          </select>
        </label>
        <Field label="Maximum route miles" type="number" min="1" max="25" value={String(draft.maximumRouteMiles)} onChange={(value) => change("maximumRouteMiles", Number(value))} />
        <label className="text-sm font-bold md:col-span-2">
          Internal description (optional)
          <textarea value={draft.description} onChange={(event) => change("description", event.target.value)} maxLength={300} className="mt-2 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" placeholder="Nearby cities served as one local marketplace area." />
        </label>
        <label className="text-sm font-bold md:col-span-2">
          ZIP codes
          <span className="mt-1 block text-xs font-normal text-slate-500">Comma- or space-separated ZIP codes. ZIP matching takes priority over city-name matching.</span>
          <textarea value={draft.postalCodes.join(", ")} onChange={(event) => change("postalCodes", event.target.value.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean))} className="mt-2 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" placeholder="52240, 52241, 52317" />
        </label>
        <label className="text-sm font-bold md:col-span-2">
          Google place IDs (optional)
          <span className="mt-1 block text-xs font-normal text-slate-500">One Place ID per line for exact locality matching when Google returns an alternate postal city.</span>
          <textarea value={draft.placeIds.join("\n")} onChange={(event) => change("placeIds", event.target.value.split(/\n+/).map((value) => value.trim()).filter(Boolean))} className="mt-2 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" placeholder="ChIJ..." />
        </label>
        <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-3 text-sm font-bold md:col-span-2">
          <input type="checkbox" checked={draft.isActive} onChange={(event) => change("isActive", event.target.checked)} />
          Zone is active and available for operational assignment
        </label>
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600">Close</button>
        <button type="button" disabled={saving} onClick={onSave} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {saving ? "Saving…" : selectedZone ? "Save zone" : "Create zone"}
        </button>
      </div>

      {selectedZone && (
        <section className="mt-6 border-t border-slate-200 pt-5">
          <h3 className="font-bold">Cities in this zone</h3>
          <p className="mt-1 text-sm text-slate-500">A city/state pair can belong to only one delivery zone.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_7rem_auto]">
            <input value={cityName} onChange={(event) => setCityName(event.target.value)} maxLength={80} placeholder="City name" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <select value={cityStateCode} onChange={(event) => setCityStateCode(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
              {STATE_CODES.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
            <button type="button" disabled={citySaving || !cityName.trim()} onClick={onAddCity} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              <Plus className="h-4 w-4" />
              Add city
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {selectedZone.cities.length === 0 ? (
              <p className="text-sm text-slate-400">No cities added yet.</p>
            ) : selectedZone.cities.map((city) => (
              <span key={city.key} className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-800 ring-1 ring-orange-100">
                {city.name}, {city.stateCode}
                <button type="button" onClick={() => onRemoveCity(city.key, `${city.name}, ${city.stateCode}`)} className="rounded-full p-0.5 hover:bg-orange-100" aria-label={`Remove ${city.name}, ${city.stateCode}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        </section>
      )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  min?: string;
  max?: string;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      <input type={type} value={value} placeholder={placeholder} min={min} max={max} onChange={(event) => onChange(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
    </label>
  );
}
