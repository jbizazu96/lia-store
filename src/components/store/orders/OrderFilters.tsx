"use client";

/*
  Search and filter bar for orders.
*/

import {
  ORDER_STATUS_CONFIG,
} from "@/config/orderStatus";
import {Search, X} from "lucide-react";

interface OrderFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  onClearFilters: () => void;
  hasFilters: boolean;
  fromDate: string;
  toDate: string;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onExport: () => void;
}

const statusOptions = [
  {
    value: "all",
    label: "All Statuses",
  },

  ...Object.entries(
    ORDER_STATUS_CONFIG
  ).map(
    ([value, config]) => ({
      value,
      label: config.label,
    })
  ),
];

export function OrderFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  onClearFilters,
  hasFilters,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  onExport,
}: OrderFiltersProps) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by pickup code, customer, or order ID..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent text-base sm:text-sm"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 text-sm min-w-[140px]"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Clear Filters */}
        {hasFilters && (
          <button
            onClick={onClearFilters}
            className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition flex items-center gap-1.5"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3">
        <label className="text-xs text-gray-500">Paid from<input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => onFromDateChange(event.target.value)} className="mt-1 block rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700" /></label>
        <label className="text-xs text-gray-500">Paid through<input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => onToDateChange(event.target.value)} className="mt-1 block rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700" /></label>
        <button type="button" onClick={onExport} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Export loaded CSV</button>
      </div>
    </div>
  );
}
