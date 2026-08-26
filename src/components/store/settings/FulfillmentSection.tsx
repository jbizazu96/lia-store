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
          <p className="mt-1 text-sm text-gray-500">Delivery continues through Shipday. Pickup orders are handed directly to the customer and never create a Shipday delivery.</p>
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
    </section>
  );
}
