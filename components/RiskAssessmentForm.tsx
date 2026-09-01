"use client";

import { useState } from "react";
import { HazardItem, RiskAssessmentItem } from "@/lib/arovia";
import { supabase } from "@/lib/supabase/client";

interface RiskAssessmentFormProps {
  hazards: HazardItem[];
  existingRiskAssessment?: RiskAssessmentItem;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function RiskAssessmentForm({ hazards, existingRiskAssessment, onSuccess, onCancel }: RiskAssessmentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    hazard_id: existingRiskAssessment?.hazard_id ?? (hazards.length > 0 ? hazards[0].id : ""),
    risk_score: existingRiskAssessment?.risk_score ?? "",
    risk_level: existingRiskAssessment?.risk_level ?? "medium",
    assessed_at: existingRiskAssessment?.assessed_at 
      ? new Date(existingRiskAssessment.assessed_at).toISOString().slice(0, 16) 
      : new Date().toISOString().slice(0, 16)
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        hazard_id: formData.hazard_id,
        risk_score: formData.risk_score === "" ? null : Number(formData.risk_score),
        risk_level: formData.risk_level,
        assessed_at: new Date(formData.assessed_at).toISOString(),
      };

      if (existingRiskAssessment) {
        const { error } = await supabase
          .from("risk_assessments")
          .update(payload)
          .eq("id", existingRiskAssessment.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("risk_assessments")
          .insert(payload);

        if (error) throw error;
      }

      onSuccess();
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred while saving the risk assessment.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xl max-w-lg w-full">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-900">
          {existingRiskAssessment ? "Edit Risk Assessment" : "Assess Risk"}
        </h3>
        <p className="text-sm text-slate-500">
          Record a risk assessment for a hazard. Your access is restricted by your geographic scope.
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
          <label className="block text-sm font-medium text-slate-700 mb-1">Target Hazard</label>
          <select
            value={formData.hazard_id}
            onChange={(e) => setFormData({ ...formData, hazard_id: e.target.value })}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            required
            disabled={!!existingRiskAssessment}
          >
            <option value="" disabled>Select a hazard...</option>
            {hazards.map((haz) => (
              <option key={haz.id} value={haz.id}>
                {haz.type} (Sev: {haz.severity}) - {haz.habitation_name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Risk Score (Numeric)</label>
            <input
              type="number"
              step="any"
              value={formData.risk_score}
              onChange={(e) => setFormData({ ...formData, risk_score: e.target.value })}
              placeholder="e.g. 7.5"
              className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Risk Level</label>
            <select
              value={formData.risk_level}
              onChange={(e) => setFormData({ ...formData, risk_level: e.target.value })}
              className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              required
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Assessed At</label>
          <input
            type="datetime-local"
            value={formData.assessed_at}
            onChange={(e) => setFormData({ ...formData, assessed_at: e.target.value })}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            required
          />
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
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting && <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {existingRiskAssessment ? "Update Assessment" : "Submit Assessment"}
          </button>
        </div>
      </form>
    </div>
  );
}
