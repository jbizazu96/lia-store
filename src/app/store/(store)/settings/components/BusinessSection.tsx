"use client";

/*
  Business information section.
*/

import {Building, FileText, Briefcase, Badge} from "lucide-react";

interface BusinessSectionProps {
  storeData: any;
  setStoreData: (data: any) => void;
}

export function BusinessSection({storeData, setStoreData}: BusinessSectionProps) {
  const businessTypes = [
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
    </div>
  );
}