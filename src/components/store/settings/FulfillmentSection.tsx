"use client";

import type {Dispatch, SetStateAction} from "react";
import {ShoppingBag, Truck} from "lucide-react";
import type {StoreWorkspaceStore} from "@/services/store/storeWorkspaceClientService";

interface Props {
  storeData: StoreWorkspaceStore;
  setStoreData: Dispatch<SetStateAction<StoreWorkspaceStore | null>>;
}

export function FulfillmentSection({storeData, setStoreData}: Props) {
  const update = (values: Partial<StoreWorkspaceStore>) =>
    setStoreData((current) => current ? {...current, ...values} : current);

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-orange-50 p-2 text-orange-600"><ShoppingBag className="h-5 w-5" /></span>
        <div>
          <h2 className="font-bold text-gray-900">Delivery & customer pickup</h2>
          <p className="mt-1 text-sm text-gray-500">Delivery orders continue through LIA Delivery. Pickup orders are handed directly to the customer and do not create a delivery assignment.</p>
        </div>
      </div>

      <label className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-gray-100 p-4">
        <span>
          <span className="flex items-center gap-2 text-sm font-bold text-gray-800"><Truck className="h-4 w-4" /> Offer customer pickup</span>
          <span className="mt-1 block text-xs text-gray-500">Customers can choose pickup only while both LIA and this store have pickup enabled.</span>
        </span>
        <input
          type="checkbox"
          checked={storeData.pickupEnabled}
          onChange={(event) => update({pickupEnabled: event.target.checked})}
          className="h-5 w-5 accent-orange-500"
        />
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-gray-700">
          Typical preparation time
          <div className="mt-1 flex items-center rounded-xl border border-gray-200 px-3">
            <input
              type="number"
              min={5}
              max={240}
              step={5}
              value={storeData.pickupPreparationMinutes}
              onChange={(event) => update({pickupPreparationMinutes: Number(event.target.value)})}
              className="w-full bg-transparent py-2.5 outline-none"
            />
            <span className="text-xs text-gray-400">minutes</span>
          </div>
        </label>
        <label className="text-sm font-semibold text-gray-700 sm:col-span-2">
          Pickup instructions
          <textarea
            rows={3}
            maxLength={500}
            value={storeData.pickupInstructions}
            onChange={(event) => update({pickupInstructions: event.target.value})}
            placeholder="Example: Pick up at the service desk and bring your pickup code."
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-300"
          />
        </label>
      </div>
      <div className="mt-5 rounded-xl border border-orange-100 bg-orange-50/40 p-4">
        <h3 className="text-sm font-bold text-gray-900">Scheduled orders</h3>
        <p className="mt-1 text-xs leading-5 text-gray-600">Available windows follow the weekly Store Schedule. LIA&apos;s global policy can temporarily disable either method.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-xl bg-white p-3 text-sm font-semibold"><span>Scheduled pickup</span><input type="checkbox" checked={storeData.scheduledPickupEnabled} onChange={(event) => update({scheduledPickupEnabled: event.target.checked})} className="h-5 w-5 accent-orange-500"/></label>
          <label className="flex items-center justify-between rounded-xl bg-white p-3 text-sm font-semibold"><span>Scheduled delivery</span><input type="checkbox" checked={storeData.scheduledDeliveryEnabled} onChange={(event) => update({scheduledDeliveryEnabled: event.target.checked})} className="h-5 w-5 accent-orange-500"/></label>
          <label className="text-sm font-semibold text-gray-700">Orders allowed per time slot<input type="number" min={1} max={100} value={storeData.scheduledOrdersPerSlot} onChange={(event) => update({scheduledOrdersPerSlot: Number(event.target.value)})} className="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"/></label>
          <label className="text-sm font-semibold text-gray-700">Store timezone<select value={storeData.fulfillmentTimezone} onChange={(event) => update({fulfillmentTimezone: event.target.value})} className="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"><option value="America/New_York">Eastern</option><option value="America/Chicago">Central</option><option value="America/Denver">Mountain</option><option value="America/Phoenix">Arizona</option><option value="America/Los_Angeles">Pacific</option><option value="America/Anchorage">Alaska</option><option value="Pacific/Honolulu">Hawaii</option></select></label>
        </div>
      </div>
    </section>
  );
}
