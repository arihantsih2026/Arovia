import { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertItem,
  HabitationItem,
  HazardItem,
  ScenarioItem,
  ActionPlanItem,
  EvacuationPlan,
  RiskAssessmentItem,
  SafetyTeamItem,
} from "./arovia";
import { GeoJSONPoint, GeoJSONPolygon, GeoJSONLineString } from "./spatial";

export interface ResponseResource {
  id: string;
  device_id: string;
  type: string;
  status: string | null;
  location: string | null;
}

export interface ScenarioIntelligenceResult {
  scenario: ScenarioItem;
  habitations: HabitationItem[];
  hazards: HazardItem[];
  riskAssessments: RiskAssessmentItem[];
  alerts: AlertItem[];
  resources: ResponseResource[];
  actionPlans: ActionPlanItem[];
  evacuationPlans: EvacuationPlan[];
  safetyTeams: SafetyTeamItem[];
}

export function getActionPriorityLabel(priority: number | null): string {
  if (priority === 1) return "Critical";
  if (priority === 2) return "High";
  if (priority === 3) return "Medium";
  if (priority && priority >= 4) return "Low";
  return "Unrated";
}

export function getActionPriorityColor(priority: number | null): string {
  if (priority === 1) return "bg-rose-100 text-rose-800 border-rose-200";
  if (priority === 2) return "bg-orange-100 text-orange-800 border-orange-200";
  if (priority === 3) return "bg-amber-100 text-amber-800 border-amber-200";
  if (priority && priority >= 4) return "bg-blue-100 text-blue-800 border-blue-200";
  return "bg-slate-100 text-slate-800 border-slate-200";
}

export class ScenarioEngine {
  private supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Fetches deterministic operational intelligence for a given scenario.
   * Leverages the `get_scenario_intelligence` Postgres RPC to perform 
   * spatial joins using PostGIS entirely within the database.
   * 
   * @param scenarioId The UUID of the scenario to analyze
   * @returns ScenarioIntelligenceResult or null if access denied / not found
   */
  async getIntelligence(scenarioId: string): Promise<ScenarioIntelligenceResult | null> {
    const { data, error } = await this.supabase.rpc("get_scenario_intelligence", {
      p_scenario_id: scenarioId,
    });

    if (error || !data) {
      console.error("ScenarioEngine Intelligence Error:", error);
      return null;
    }

    return data as ScenarioIntelligenceResult;
  }
}
