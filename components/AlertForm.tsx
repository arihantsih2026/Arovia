"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { AlertItem, UserRole } from "@/lib/arovia";

interface AlertFormProps {
  initialData?: AlertItem;
  userRole: UserRole;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AlertForm({ initialData, userRole, onSuccess, onCancel }: AlertFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: initialData?.title || "",
    message: initialData?.message || "",
    severity: initialData?.severity || "Medium",
    audience: initialData?.audience || (userRole === "state" ? "state" : "city"),
    active: initialData?.active ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (initialData) {
        // Update
        const { error: updateError } = await supabase
          .from("alerts")
          .update({
            title: formData.title,
            message: formData.message,
            severity: formData.severity,
            audience: formData.audience,
            active: formData.active,
          })
          .eq("id", initialData.id);
        
        if (updateError) throw updateError;
      } else {
        // Insert
        const { error: insertError } = await supabase
          .from("alerts")
          .insert({
            title: formData.title,
            message: formData.message,
            severity: formData.severity,
            audience: formData.audience,
            active: formData.active,
          });

        if (insertError) throw insertError;
      }

      onSuccess();
    } catch (err) {
      console.error(err);
      const errorObj = err as { code?: string; message?: string };
      if (errorObj.code === "42501" || errorObj.message?.includes("row-level security")) {
        setError("Database rejected this operation because it is outside your authorized scope.");
      } else {
        setError(errorObj.message || "An error occurred while saving the alert.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xl max-w-lg w-full">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-900">
          {initialData ? "Edit Alert" : "Broadcast New Alert"}
        </h3>
        <p className="text-sm text-slate-500">
          {initialData ? "Modify broadcast parameters or deactivate this alert." : "Distribute a live alert to connected dashboards based on audience."}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg">
          <p className="font-semibold">Error</p>
          <p>{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Alert Title</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            placeholder="e.g. Flash Flood Warning"
            maxLength={100}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
          <textarea
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            placeholder="Detailed instructions or warning information..."
            rows={3}
            maxLength={1000}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Severity</label>
            <select
              value={formData.severity}
              onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
              className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              required
            >
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Target Audience</label>
            <select
              value={formData.audience}
              onChange={(e) => setFormData({ ...formData, audience: e.target.value as "public" | "city" | "state" })}
              className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              required
            >
              <option value="public">Public</option>
              {(userRole === "city" || userRole === "state") && <option value="city">City Teams</option>}
              {userRole === "state" && <option value="state">State Teams</option>}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <input
            type="checkbox"
            id="alert-active"
            checked={formData.active}
            onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
            className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
          />
          <label htmlFor="alert-active" className="text-sm font-medium text-slate-700">
            Alert is Active
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : initialData ? "Update Alert" : "Broadcast"}
          </button>
        </div>
      </form>
    </div>
  );
}
