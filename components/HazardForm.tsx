"use client";

import { useState } from "react";
import { HabitationItem, HazardItem } from "@/lib/arovia";
import { supabase } from "@/lib/supabase/client";

interface HazardFormProps {
  habitations: HabitationItem[];
  existingHazard?: HazardItem;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function HazardForm({ habitations, existingHazard, onSuccess, onCancel }: HazardFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    habitation_id: existingHazard?.habitation_id ?? (habitations.length > 0 ? habitations[0].id : ""),
    type: existingHazard?.type ?? "flood",
    severity: existingHazard?.severity ?? 1,
    event_time: existingHazard?.event_time 
      ? new Date(existingHazard.event_time).toISOString().slice(0, 16) 
      : new Date().toISOString().slice(0, 16)
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (existingHazard) {
        const { error } = await supabase
          .from("hazards")
          .update({
            habitation_id: formData.habitation_id,
            type: formData.type,
            severity: Number(formData.severity),
            event_time: new Date(formData.event_time).toISOString(),
          })
          .eq("id", existingHazard.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("hazards")
          .insert({
            habitation_id: formData.habitation_id,
            type: formData.type,
            severity: Number(formData.severity),
            event_time: new Date(formData.event_time).toISOString(),
          });

        if (error) throw error;
      }

      onSuccess();
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred while saving the hazard.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xl max-w-lg w-full">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-900">
          {existingHazard ? "Edit Hazard" : "Log New Hazard"}
        </h3>
        <p className="text-sm text-slate-500">
          Record a new hazard event. Your access is restricted by your geographic scope.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg">
          <p className="font-semibold">Database Rejection</p>
          <p>{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Affected Habitation</label>
          <select
            value={formData.habitation_id}
            onChange={(e) => setFormData({ ...formData, habitation_id: e.target.value })}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            required
            disabled={!!existingHazard}
          >
            <option value="" disabled>Select a habitation...</option>
            {habitations.map((hab) => (
              <option key={hab.id} value={hab.id}>
                {hab.name} ({hab.district}, {hab.state})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Hazard Type</label>
          <input
            type="text"
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            placeholder="e.g. flood, cyclone, landslide"
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Severity (≥ 1)</label>
            <input
              type="number"
              min="1"
              value={formData.severity}
              onChange={(e) => setFormData({ ...formData, severity: Number(e.target.value) })}
              className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Event Time</label>
            <input
              type="datetime-local"
              value={formData.event_time}
              onChange={(e) => setFormData({ ...formData, event_time: e.target.value })}
              className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              required
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3 justify-end pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting && <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {existingHazard ? "Update Hazard" : "Submit Hazard"}
          </button>
        </div>
      </form>
    </div>
  );
}
