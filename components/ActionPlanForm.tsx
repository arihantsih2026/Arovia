"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

interface ActionPlanFormProps {
  scenarioId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ActionPlanForm({ scenarioId, onSuccess, onCancel }: ActionPlanFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    action: "",
    priority: 2,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("action_plans").insert({
        scenario_id: scenarioId,
        action: formData.action,
        priority: Number(formData.priority),
      });

      if (error) throw error;
      onSuccess();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "An error occurred while saving the action plan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xl max-w-lg w-full">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-900">
          Create Action Plan
        </h3>
        <p className="text-sm text-slate-500">
          Add an action step for the selected scenario.
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
          <label className="block text-sm font-medium text-slate-700 mb-1">Action Description</label>
          <textarea
            value={formData.action}
            onChange={(e) => setFormData({ ...formData, action: e.target.value })}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-24"
            placeholder="e.g. Deploy water rescue teams to Sector 4"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Priority (1=Critical, 2=High, 3=Medium, 4=Low)</label>
          <select
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            required
          >
            <option value={1}>1 - Critical</option>
            <option value={2}>2 - High</option>
            <option value={3}>3 - Medium</option>
            <option value={4}>4 - Low</option>
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Save Action Plan"}
          </button>
        </div>
      </form>
    </div>
  );
}
