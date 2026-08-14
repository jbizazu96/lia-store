"use client";

/*
  Business information section.
*/

import {Building, FileText, Briefcase, Badge, ExternalLink, LoaderCircle} from "lucide-react";
import {useEffect, useState, type Dispatch, type SetStateAction} from "react";
import {storeWorkspaceClientService, type StoreWorkspaceStore} from "@/services/store/storeWorkspaceClientService";
import type {StoreContractWorkspace} from "@/types/storeContract";

interface BusinessSectionProps {
  storeData: StoreWorkspaceStore;
  setStoreData: Dispatch<SetStateAction<StoreWorkspaceStore | null>>;
}

export function BusinessSection({storeData, setStoreData}: BusinessSectionProps) {
  const [contracts, setContracts] = useState<StoreContractWorkspace | null>(null);
  const [contractError, setContractError] = useState("");
  const [openingContract, setOpeningContract] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void storeWorkspaceClientService.getContracts().then((result) => {
      if (active) { setContracts(result); setContractError(""); }
    }).catch((reason: unknown) => {
      if (active) setContractError(reason instanceof Error ? reason.message : "Your store agreement could not be loaded.");
    });
    return () => { active = false; };
  }, []);

  const viewContract = async (contractId: string) => {
    setOpeningContract(contractId); setContractError("");
    const previewWindow = window.open("", "_blank");
    try {
      const result = await storeWorkspaceClientService.getContractPreview(contractId);
      if (previewWindow) { previewWindow.opener = null; previewWindow.location.href = result.url; }
      else window.location.assign(result.url);
    } catch (reason) {
      previewWindow?.close();
      setContractError(reason instanceof Error ? reason.message : "The contract could not be opened.");
    } finally { setOpeningContract(null); }
  };
  const businessTypes = [
    {value: "grocery", label: "Grocery Store"},
    {value: "market", label: "Market"},
    {value: "specialty_food", label: "Specialty Food Store"},
    {value: "international_grocery", label: "International Grocery"},
    {value: "asian_market", label: "Asian Market"},
    {value: "latin_market", label: "Latin or Mexican Market"},
    {value: "convenience_store", label: "Convenience Store"},
    {value: "specialty_retail", label: "Specialty Retail"},
    {value: "restaurant", label: "Restaurant"},
    {value: "bakery", label: "Bakery"},
    {value: "pharmacy_health", label: "Pharmacy or Health Store"},
    {value: "african_grocery", label: "African Grocery Store"},
    {value: "african_restaurant", label: "African Restaurant"},
    {value: "home_based", label: "Home-Based Business"},
    {value: "african_market", label: "African Market"},
    {value: "other", label: "Other"},
  ];

  const businessStructures = [
    {value: "llc", label: "LLC"},
    {value: "sole_proprietorship", label: "Sole Proprietorship"},
    {value: "corporation", label: "Corporation"},
    {value: "partnership", label: "Partnership"},
    {value: "dba", label: "DBA"},
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-4">Business Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Type *
            </label>
            <div className="relative">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={storeData?.businessType || ""}
                onChange={(e) => setStoreData({...storeData, businessType: e.target.value})}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Select business type</option>
                {businessTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Registered Business Name *
            </label>
            <div className="relative">
              <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                maxLength={160}
                value={storeData?.registeredName || ""}
                onChange={(e) => setStoreData({...storeData, registeredName: e.target.value})}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                placeholder="Official business name"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              EIN (Optional)
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                maxLength={10}
                value={storeData?.ein || ""}
                onChange={(e) => setStoreData({...storeData, ein: e.target.value})}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                placeholder="12-3456789"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Structure *
            </label>
            <div className="relative">
              <Badge className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={storeData?.businessStructure || ""}
                onChange={(e) => setStoreData({...storeData, businessStructure: e.target.value})}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Select structure</option>
                {businessStructures.map((struct) => (
                  <option key={struct.value} value={struct.value}>
                    {struct.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3"><div className="rounded-lg bg-orange-50 p-2 text-orange-600"><FileText className="h-5 w-5"/></div><div><h3 className="font-bold text-gray-800">LIA Store Agreement</h3><p className="mt-1 text-sm text-gray-500">Your signed agreement is private and can only be managed by LIA administrators.</p></div></div>
        {contractError && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"><p>{contractError}</p><button type="button" onClick={() => window.location.reload()} className="mt-2 font-bold underline">Retry</button></div>}
        {!contracts && !contractError ? <div className="mt-5 flex items-center gap-2 text-sm text-gray-500"><LoaderCircle className="h-4 w-4 animate-spin text-orange-500"/>Loading agreement…</div> : contracts && <>
          <div className="mt-5 space-y-2">{contracts.contracts.length ? contracts.contracts.map((contract) => <div key={contract.id} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/50 p-3"><FileText className="h-5 w-5 shrink-0 text-gray-400"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-gray-800">{contract.fileName}</p><p className="text-xs text-gray-500">Signed contract · {contract.uploadedAt ? new Date(contract.uploadedAt).toLocaleDateString() : "On file"}</p></div><button type="button" disabled={openingContract === contract.id} onClick={() => void viewContract(contract.id)} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{openingContract === contract.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin"/> : <ExternalLink className="h-3.5 w-3.5"/>}View</button></div>) : <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No signed agreement is currently available. Contact LIA Support if you expected to see one.</p>}</div>
          <div className="mt-5 border-t border-gray-100 pt-4"><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Agreed commission</p><p className="mt-1 text-2xl font-bold text-gray-900">{(contracts.commission.basisPoints / 100).toFixed(2).replace(/\.00$/, "")}%</p><p className="mt-1 text-xs text-gray-500">{contracts.commission.source === "store_override" ? "Store-specific rate assigned by LIA" : "Default LIA marketplace rate"}</p></div>
        </>}
      </div>
    </div>
  );
}
