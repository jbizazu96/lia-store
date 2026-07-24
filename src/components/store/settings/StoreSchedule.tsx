"use client";

/*
  Store Schedule Component
  Allows store owners to set their operating hours for each day of the week.
*/

import { useState, useEffect } from "react";
import { Clock, Save, Edit, AlertCircle, CheckCircle, X } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { useConfirmation } from "@/context/ConfirmationContext";
import { useSuccessToast } from "@/context/SuccessToastContext";

interface ScheduleDay {
  day: string;
  open: string;
  close: string;
  isClosed: boolean;
}

interface StoreScheduleProps {
  storeData: any;
  setStoreData: (data: any) => void;
  storeId: string;
}

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

const DEFAULT_SCHEDULE: ScheduleDay[] = [
  { day: "Monday", open: "09:00", close: "18:00", isClosed: false },
  { day: "Tuesday", open: "09:00", close: "18:00", isClosed: false },
  { day: "Wednesday", open: "09:00", close: "18:00", isClosed: false },
  { day: "Thursday", open: "09:00", close: "18:00", isClosed: false },
  { day: "Friday", open: "09:00", close: "18:00", isClosed: false },
  { day: "Saturday", open: "10:00", close: "16:00", isClosed: false },
  { day: "Sunday", open: "00:00", close: "00:00", isClosed: true },
];

export function StoreSchedule({ storeData, setStoreData, storeId }: StoreScheduleProps) {
  const { showSuccess } = useSuccessToast();
  const [schedule, setSchedule] = useState<ScheduleDay[]>(DEFAULT_SCHEDULE);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tempSchedule, setTempSchedule] = useState<ScheduleDay[]>(DEFAULT_SCHEDULE);

  const hasUnsavedChanges =
    isEditing &&
    JSON.stringify(tempSchedule) !== JSON.stringify(schedule);

  useUnsavedChanges(hasUnsavedChanges);
  const { confirm } = useConfirmation();

  // Load schedule from storeData
  useEffect(() => {
    if (storeData?.schedule && Array.isArray(storeData.schedule)) {
      setSchedule(storeData.schedule);
      setTempSchedule(storeData.schedule);
    }
  }, [storeData]);

  // Handle input change for a specific day
  const handleScheduleChange = (index: number, field: keyof ScheduleDay, value: any) => {
    const updated = [...tempSchedule];
    updated[index] = { ...updated[index], [field]: value };
    setTempSchedule(updated);
  };

  // Toggle closed status for a day
  const toggleClosed = (index: number) => {
    const updated = [...tempSchedule];
    updated[index].isClosed = !updated[index].isClosed;
    if (updated[index].isClosed) {
      updated[index].open = "00:00";
      updated[index].close = "00:00";
    } else {
      updated[index].open = "09:00";
      updated[index].close = "18:00";
    }
    setTempSchedule(updated);
  };

  // Save schedule to Firestore
  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveError(null);
      setSaveSuccess(false);

      const user = auth.currentUser;
      if (!user) {
        setSaveError("You must be logged in to save schedule.");
        return;
      }

      if (!storeId) {
        setSaveError("Store ID not found. Please try again.");
        return;
      }

      const confirmed = await confirm({
        title: "Save store hours?",
        message: "Your updated schedule will be visible to customers.",
        confirmLabel: "Save schedule",
        cancelLabel: "Keep editing",
      });

      if (!confirmed) return;

      // Save schedule to store document
      const storeRef = doc(db, "stores", storeId);
      await setDoc(storeRef, { schedule: tempSchedule }, { merge: true });

      // Update local state
      setSchedule(tempSchedule);
      
      // Update storeData
      if (setStoreData) {
        setStoreData({ ...storeData, schedule: tempSchedule });
      }

      setSaveSuccess(true);
      showSuccess("Store hours updated.");
      setIsEditing(false);
      
      // Hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error saving schedule:", error);
      setSaveError(error.message || "Failed to save schedule. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Cancel editing - revert to saved schedule
  const handleCancel = async () => {
    const confirmed = !hasUnsavedChanges || await confirm({
      title: "Discard schedule changes?",
      message: "Your updated hours have not been saved.",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    setTempSchedule([...schedule]);
    setIsEditing(false);
    setSaveError(null);
  };

  // Format time for display
  const formatTime = (time: string) => {
    if (time === "00:00") return "Closed";
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  };

  const openDaysCount = schedule.filter(d => !d.isClosed).length;

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Clock className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800">Store Schedule</h3>
            <p className="text-sm text-gray-500">Set your weekly operating hours</p>
          </div>
        </div>
        
        {/* Action Buttons */}
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-xl transition"
          >
            <Edit className="w-4 h-4" />
            Edit Schedule
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Schedule
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Success Message */}
      {saveSuccess && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-green-700">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm font-medium">Schedule saved successfully!</span>
        </div>
      )}

      {/* Error Message */}
      {saveError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm font-medium">{saveError}</span>
        </div>
      )}

      {/* Schedule Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Day
              </th>
              <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Open
              </th>
              <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Close
              </th>
              {isEditing && (
                <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(isEditing ? tempSchedule : schedule).map((day, index) => {
              const currentDay = isEditing ? tempSchedule[index] : day;
              
              return (
                <tr key={day.day} className="hover:bg-gray-50/50 transition">
                  <td className="py-3 px-2">
                    <span className="font-medium text-gray-800 text-sm">
                      {day.day}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    {isEditing ? (
                      <button
                        onClick={() => toggleClosed(index)}
                        className={`px-3 py-1 text-xs font-medium rounded-full transition ${
                          currentDay.isClosed
                            ? "bg-red-100 text-red-700 hover:bg-red-200"
                            : "bg-green-100 text-green-700 hover:bg-green-200"
                        }`}
                      >
                        {currentDay.isClosed ? "Closed" : "Open"}
                      </button>
                    ) : (
                      <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                        day.isClosed
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                      }`}>
                        {day.isClosed ? "Closed" : "Open"}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    {isEditing ? (
                      <input
                        type="time"
                        value={currentDay.open}
                        onChange={(e) => handleScheduleChange(index, "open", e.target.value)}
                        disabled={currentDay.isClosed}
                        className={`w-24 px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
                          currentDay.isClosed
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-white border-gray-200"
                        }`}
                      />
                    ) : (
                      <span className="text-sm text-gray-700">
                        {day.isClosed ? "—" : formatTime(day.open)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    {isEditing ? (
                      <input
                        type="time"
                        value={currentDay.close}
                        onChange={(e) => handleScheduleChange(index, "close", e.target.value)}
                        disabled={currentDay.isClosed}
                        className={`w-24 px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
                          currentDay.isClosed
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-white border-gray-200"
                        }`}
                      />
                    ) : (
                      <span className="text-sm text-gray-700">
                        {day.isClosed ? "—" : formatTime(day.close)}
                      </span>
                    )}
                  </td>
                  {isEditing && (
                    <td className="py-3 px-2">
                      <button
                        onClick={() => toggleClosed(index)}
                        className={`text-xs font-medium px-2 py-1 rounded transition ${
                          currentDay.isClosed
                            ? "text-green-600 hover:bg-green-50"
                            : "text-red-600 hover:bg-red-50"
                        }`}
                      >
                        {currentDay.isClosed ? "Open" : "Close"}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* View Mode Summary */}
      {!isEditing && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>Open</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span>Closed</span>
              </div>
            </div>
            <div>
              <span className="font-medium text-gray-700">{openDaysCount}</span>
              {" "}days open
            </div>
          </div>
        </div>
      )}

      {/* Edit Mode Help Text */}
      {isEditing && (
        <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
          <p className="text-xs text-blue-600 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" />
            Click the day's status button to toggle between open/closed. 
            Use the time inputs to set your opening and closing hours.
          </p>
        </div>
      )}
    </div>
  );
}
