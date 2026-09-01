"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { GeoJSONPolygon } from "@/lib/spatial";

interface ScenarioFormProps {
  geoJson?: GeoJSONPolygon | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ScenarioForm({ geoJson, onSuccess, onCancel }: ScenarioFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    hazard_type: "flood",
    severity: 1,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!geoJson) {
      setError("Please draw an affected area on the map first.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("scenarios").insert({
        name: formData.name,
        description: formData.description,
        hazard_type: formData.hazard_type,
        severity: Number(formData.severity),
        affected_area: geoJson,
      });

      if (error) throw error;
      onSuccess();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "An error occurred while saving the scenario.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xl max-w-lg w-full">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-900">
          Create New Scenario
        </h3>
        <p className="text-sm text-slate-500">
          Define the operational metadata for this scenario. Your drawn polygon will be attached automatically.
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
          <label className="block text-sm font-medium text-slate-700 mb-1">Scenario Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="e.g. Cyclone Alpha Response"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Primary Hazard Type</label>
          <select
            value={formData.hazard_type}
            onChange={(e) => setFormData({ ...formData, hazard_type: e.target.value })}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            required
          >
            <option value="flood">Flood</option>
            <option value="cyclone">Cyclone</option>
            <option value="earthquake">Earthquake</option>
            <option value="wildfire">Wildfire</option>
            <option value="chemical_spill">Chemical Spill</option>
            <option value="infrastructure_failure">Infrastructure Failure</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Severity Level (1-5)</label>
          <input
            type="number"
            min="1"
            max="5"
            value={formData.severity}
            onChange={(e) => setFormData({ ...formData, severity: Number(e.target.value) })}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-24"
            placeholder="Detailed description of the scenario..."
            required
          />
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
            disabled={isSubmitting || !geoJson}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? "Saving..." : "Save Scenario"}
          </button>
        </div>
      </form>
    </div>
  );
}
