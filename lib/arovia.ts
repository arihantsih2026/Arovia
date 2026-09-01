import { GeoJSONLineString, GeoJSONPolygon } from "./spatial";

export const userRoles = ["public", "city", "state"] as const;

export type UserRole = (typeof userRoles)[number];

export type ScenarioStatus = "active" | "resolved" | "archived";
export type ActionPlanStatus = "pending" | "in_progress" | "completed";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  city_id: string | null;
  state_id: string | null;
}

export interface DashboardMetrics {
  habitations: number;
  hazards: number;
  riskAssessments: number;
  roads: number;
  routes: number;
  scenarios: number;
}

export interface HabitationItem {
  id: string;
  name: string;
  district: string;
  state: string;
  population: number | null;
  location?: string | null;
  coordinates?: [number, number] | null; // [longitude, latitude]
}

export interface HazardItem {
  id: string;
  habitation_id: string;
  type: string;
  severity: number;
  event_time: string;
  habitation_name?: string;
  habitation_district?: string;
  habitation_state?: string;
  coordinates?: [number, number] | null; // [longitude, latitude] inherited from habitation
}

export interface RiskAssessmentItem {
  id: string;
  hazard_id: string;
  risk_score: number | null;
  risk_level: string | null;
  assessed_at: string | null;
  hazard_type?: string;
  hazard_severity?: number;
  habitation_name?: string;
}

export interface RoadItem {
  id: string;
  name: string | null;
  road_type: string | null;
  accessibility: string | null;
  geometry: GeoJSONLineString | string | null;
}

export interface RouteItem {
  id: string;
  origin: string | null;
  destination: string | null;
  geometry: GeoJSONLineString | string | null;
  distance: number | null;
  estimated_time: string | null;
}

export interface ScenarioItem {
  id: string;
  name: string;
  description: string | null;
  hazard_type: string;
  severity: number | null;
  affected_area: GeoJSONPolygon | string | null;
  status: ScenarioStatus;
}

export interface AlertItem {
  id: string;
  title: string;
  message: string;
  severity: string;
  audience: UserRole;
  active: boolean;
  created_at: string;
}

export interface ActionPlanItem {
  id: string;
  scenario_id: string;
  action: string;
  priority: number | null;
  status: ActionPlanStatus;
  created_at: string;
}

export interface SafetyTeamItem {
  id: string;
  name: string;
  type: string;
  contact: string | null;
  created_at: string;
}

export interface RelocationSiteItem {
  id: string;
  name: string;
  capacity: number | null;
  suitability: string | null;
  location?: string | null;
  coordinates?: [number, number] | null;
}

export interface RelocationCandidate {
  site_id: string;
  site_name: string;
  capacity: number | null;
  suitability: string | null;
  distance_meters: number;
  route_id: string | null;
  route_distance: number | null;
  route_time: string | null;
}

export interface EvacuationPlan {
  habitation: HabitationItem;
  candidates: RelocationCandidate[];
}

export interface DashboardData {
  profile: Profile;
  metrics: DashboardMetrics;
  alerts: AlertItem[];
  habitations: HabitationItem[];
  hazards: HazardItem[];
  riskAssessments: RiskAssessmentItem[];
  roads: RoadItem[];
  routes: RouteItem[];
  scenarios: ScenarioItem[];
  relocationSites: RelocationSiteItem[];
}

export function isUserRole(value: string): value is UserRole {
  return userRoles.includes(value as UserRole);
}

export const roleLabels: Record<UserRole, string> = {
  public: "Public access",
  city: "City operations",
  state: "State operations",
};
