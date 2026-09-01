"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import {
  AlertItem,
  DashboardData,
  HabitationItem,
  HazardItem,
  isUserRole,
  Profile,
  RelocationSiteItem,
  RiskAssessmentItem,
  RoadItem,
  roleLabels,
  RouteItem,
  ScenarioItem,
  UserRole,
} from "@/lib/arovia";
import {
  ScenarioEngine,
  ScenarioIntelligenceResult,
  getActionPriorityLabel,
  getActionPriorityColor,
} from "@/lib/engine";
import { supabase } from "@/lib/supabase/client";
import HazardForm from "@/components/HazardForm";
import RiskAssessmentForm from "@/components/RiskAssessmentForm";
import ScenarioForm from "@/components/ScenarioForm";
import ActionPlanForm from "@/components/ActionPlanForm";
import AlertForm from "@/components/AlertForm";
import { GeoJSONPolygon } from "@/lib/spatial";

// Dynamically import Leaflet Map component with SSR disabled
const DisasterMap = dynamic(() => import("@/components/DisasterMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[540px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-900 text-white">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-teal-300/30 border-t-teal-300" />
        <p className="text-sm font-medium text-slate-300">Initializing spatial mapping engine...</p>
      </div>
    </div>
  ),
});

type DashboardState =
  | { status: "loading" }
  | { status: "ready"; data: DashboardData }
  | { status: "error"; message: string };

type DashboardTab = "overview" | "scenario" | "map" | "alerts" | "habitations" | "hazards";
type RealtimeConnectionStatus = "connected" | "connecting" | "disconnected" | "error";

const roleDescriptions: Record<UserRole, string> = {
  public: "A public view of Sentinel disaster information, spatial boundaries, and advisory alerts.",
  city: "Operational command view scoped to your assigned municipal district and local infrastructure.",
  state: "State-level emergency coordination view scoped to state zones, evacuation corridors, and impact scenarios.",
};

function getSeverityBadge(severity: string | number) {
  const norm = String(severity).toLowerCase();
  if (norm === "critical" || norm === "5" || norm === "4") {
    return "bg-rose-500/15 text-rose-700 border-rose-200";
  }
  if (norm === "high" || norm === "3") {
    return "bg-amber-500/15 text-amber-700 border-amber-200";
  }
  if (norm === "medium" || norm === "2") {
    return "bg-sky-500/15 text-sky-700 border-sky-200";
  }
  return "bg-emerald-500/15 text-emerald-700 border-emerald-200";
}

function getAudienceBadge(audience: UserRole) {
  if (audience === "public") {
    return "bg-slate-100 text-slate-700 border-slate-200";
  }
  if (audience === "city") {
    return "bg-teal-50 text-teal-700 border-teal-200";
  }
  return "bg-indigo-50 text-indigo-700 border-indigo-200";
}

function RealtimeIndicator({ status }: { status: RealtimeConnectionStatus }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        Live Realtime
      </span>
    );
  }

  if (status === "connecting") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-400">
        <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
        Connecting...
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-400">
      <span className="h-2 w-2 rounded-full bg-slate-500" />
      Offline Sync
    </span>
  );
}

function ScopeSummary({ profile }: { profile: Profile }) {
  if (profile.role === "public") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Access Scope
        </div>
        <p className="mt-2 text-base font-semibold text-slate-900">Public Information Access</p>
        <p className="mt-1 text-sm text-slate-600">
          Showing verified disaster intelligence and public advisories across all published zones.
        </p>
      </div>
    );
  }

  if (profile.role === "city") {
    return (
      <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-5 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-700">
          <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
          City Administrative Scope
        </div>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-white p-3 border border-teal-100 shadow-2xs">
            <dt className="text-xs font-medium text-slate-500">Assigned District</dt>
            <dd className="mt-1 text-base font-bold text-teal-950">
              {profile.city_id ?? "Not assigned"}
            </dd>
          </div>
          <div className="rounded-xl bg-white p-3 border border-teal-100 shadow-2xs">
            <dt className="text-xs font-medium text-slate-500">Parent State</dt>
            <dd className="mt-1 text-base font-bold text-teal-950">
              {profile.state_id ?? "Not assigned"}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-700">
        <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
        State Administrative Scope
      </div>
      <dl className="mt-3 text-sm">
        <div className="rounded-xl bg-white p-3 border border-indigo-100 shadow-2xs">
          <dt className="text-xs font-medium text-slate-500">Assigned State</dt>
          <dd className="mt-1 text-base font-bold text-indigo-950">
            {profile.state_id ?? "Not assigned"}
          </dd>
        </div>
      </dl>

    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [dashboardState, setDashboardState] = useState<DashboardState>({
    status: "loading",
  });
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>("connecting");
  const [liveEventBanner, setLiveEventBanner] = useState<string | null>(null);

  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [scenarioIntelligence, setScenarioIntelligence] = useState<ScenarioIntelligenceResult | null>(null);
  const [isEngineLoading, setIsEngineLoading] = useState(false);

  const [isHazardModalOpen, setIsHazardModalOpen] = useState(false);
  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
  const [editingHazard, setEditingHazard] = useState<HazardItem | undefined>(undefined);
  const [editingRisk, setEditingRisk] = useState<RiskAssessmentItem | undefined>(undefined);

  const [isDrawingScenario, setIsDrawingScenario] = useState(false);
  const [isScenarioModalOpen, setIsScenarioModalOpen] = useState(false);
  const [drawnScenarioGeoJson, setDrawnScenarioGeoJson] = useState<GeoJSONPolygon | null>(null);

  const [isActionPlanModalOpen, setIsActionPlanModalOpen] = useState(false);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<AlertItem | undefined>(undefined);

  const fetchDashboard = useCallback(async (): Promise<DashboardState | null> => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/login");
      return null;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, city_id, state_id")
      .eq("id", user.id)
      .maybeSingle<Profile>();

    if (profileError || !profile) {
      return {
        status: "error",
        message:
          "Your authenticated account does not have an available Sentinel profile. Please contact an administrator.",
      };
    }

    if (!isUserRole(profile.role)) {
      return {
        status: "error",
        message:
          "Your Sentinel profile contains an unsupported access role. Please contact an administrator.",
      };
    }

    const [
      habitationsResult,
      hazardsResult,
      riskAssessmentsResult,
      alertsResult,
      roadsResult,
      routesResult,
      scenariosResult,
      relocationSitesResult,
    ] = await Promise.all([
      supabase
        .from("habitations")
        .select("id, name, district, state, population, location")
        .order("name", { ascending: true }),
      supabase
        .from("hazards")
        .select("id, habitation_id, type, severity, event_time, habitations(name, district, state, location)")
        .order("event_time", { ascending: false }),
      supabase
        .from("risk_assessments")
        .select("id, hazard_id, risk_score, risk_level, assessed_at, hazards(type, severity, habitations(name))")
        .order("assessed_at", { ascending: false }),
      supabase
        .from("alerts")
        .select("id, title, message, severity, audience, active, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("roads")
        .select("id, name, road_type, accessibility, geometry")
        .order("name", { ascending: true }),
      supabase
        .from("routes")
        .select("id, origin, destination, geometry, distance, estimated_time"),
      supabase
        .from("scenarios")
        .select("id, name, description, hazard_type, severity, affected_area, status"),
      supabase
        .from("relocation_sites")
        .select("id, name, capacity, suitability, location")
        .order("name", { ascending: true }),
    ]);

    const queryError = [
      habitationsResult,
      hazardsResult,
      riskAssessmentsResult,
      alertsResult,
      roadsResult,
      routesResult,
      scenariosResult,
      relocationSitesResult,
    ].find((res) => res.error)?.error;

    if (queryError) {
      return {
        status: "error",
        message:
          "Sentinel could not load the disaster feeds for your current session. Please retry or sign in again.",
      };
    }

    const habitations: HabitationItem[] = (habitationsResult.data ?? []).map((h) => ({
      id: h.id,
      name: h.name,
      district: h.district,
      state: h.state,
      population: h.population,
      location: h.location,
    }));

    const hazards: HazardItem[] = (hazardsResult.data ?? []).map((hz: Record<string, unknown>) => {
      const hab = hz.habitations as {
        name?: string;
        district?: string;
        state?: string;
        location?: string | null;
      } | null;
      return {
        id: String(hz.id),
        habitation_id: String(hz.habitation_id),
        type: String(hz.type),
        severity: Number(hz.severity),
        event_time: String(hz.event_time),
        habitation_name: hab?.name,
        habitation_district: hab?.district,
        habitation_state: hab?.state,
      };
    });

    const riskAssessments: RiskAssessmentItem[] = (riskAssessmentsResult.data ?? []).map((r: Record<string, unknown>) => {
      const hz = r.hazards as {
        type?: string;
        severity?: number;
        habitations?: { name?: string } | null;
      } | null;
      return {
        id: String(r.id),
        hazard_id: String(r.hazard_id),
        risk_score: r.risk_score !== null ? Number(r.risk_score) : null,
        risk_level: r.risk_level ? String(r.risk_level) : null,
        assessed_at: r.assessed_at ? String(r.assessed_at) : null,
        hazard_type: hz?.type,
        hazard_severity: hz?.severity,
        habitation_name: hz?.habitations?.name,
      };
    });

    const alerts: AlertItem[] = (alertsResult.data ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      message: a.message,
      severity: a.severity,
      audience: a.audience as UserRole,
      active: a.active,
      created_at: a.created_at,
    }));

    const roads: RoadItem[] = (roadsResult.data ?? []).map((rd) => ({
      id: rd.id,
      name: rd.name,
      road_type: rd.road_type,
      accessibility: rd.accessibility,
      geometry: rd.geometry,
    }));

    const routes: RouteItem[] = (routesResult.data ?? []).map((rt) => ({
      id: rt.id,
      origin: rt.origin,
      destination: rt.destination,
      geometry: rt.geometry,
      distance: rt.distance !== null ? Number(rt.distance) : null,
      estimated_time: rt.estimated_time ? String(rt.estimated_time) : null,
    }));

    const scenarios: ScenarioItem[] = (scenariosResult.data ?? []).map((sc) => ({
      id: sc.id,
      name: sc.name,
      description: sc.description,
      hazard_type: sc.hazard_type,
      severity: sc.severity !== null ? Number(sc.severity) : null,
      affected_area: sc.affected_area,
      status: sc.status as any,
    }));

    const relocationSites: RelocationSiteItem[] = (relocationSitesResult.data ?? []).map((rs) => ({
      id: rs.id,
      name: rs.name,
      capacity: rs.capacity !== null ? Number(rs.capacity) : null,
      suitability: rs.suitability,
      location: rs.location,
    }));

    return {
      status: "ready",
      data: {
        profile,
        metrics: {
          habitations: habitations.length,
          hazards: hazards.length,
          riskAssessments: riskAssessments.length,
          roads: roads.length,
          routes: routes.length,
          scenarios: scenarios.length,
        },
        alerts,
        habitations,
        hazards,
        riskAssessments,
        roads,
        routes,
        scenarios,
        relocationSites,
      },
    };
  }, [router]);

  useEffect(() => {
    let isCurrent = true;

    void fetchDashboard()
      .then((nextState) => {
        if (isCurrent && nextState) {
          setDashboardState(nextState);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setDashboardState({
            status: "error",
            message: "Sentinel could not load the dashboard. Please retry or sign in again.",
          });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [fetchDashboard]);

  const profileId = dashboardState.status === "ready" ? dashboardState.data.profile.id : null;

  // Realtime Alert Subscription Lifecycle
  useEffect(() => {
    if (!profileId) return;

    const channel = supabase
      .channel(`sentinel-realtime-alerts-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alerts",
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const newId = (payload.new as { id?: string })?.id;
            if (!newId) return;

            // Verify row visibility via authenticated Supabase query (RLS enforcement)
            const { data: authorizedAlert, error } = await supabase
              .from("alerts")
              .select("id, title, message, severity, audience, active, created_at")
              .eq("id", newId)
              .maybeSingle<AlertItem>();

            if (!error && authorizedAlert) {
              setDashboardState((prev) => {
                if (prev.status !== "ready") return prev;
                const existing = prev.data.alerts.filter((a) => a.id !== authorizedAlert.id);
                const updatedAlerts = [authorizedAlert, ...existing].sort(
                  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );
                return {
                  ...prev,
                  data: {
                    ...prev.data,
                    alerts: updatedAlerts,
                  },
                };
              });
              setLiveEventBanner(`New broadcast alert received: "${authorizedAlert.title}"`);
              setTimeout(() => setLiveEventBanner(null), 6000);
            }
          } else if (payload.eventType === "UPDATE") {
            const updatedId = (payload.new as { id?: string })?.id;
            if (!updatedId) return;

            // Re-verify visibility under RLS
            const { data: authorizedAlert, error } = await supabase
              .from("alerts")
              .select("id, title, message, severity, audience, active, created_at")
              .eq("id", updatedId)
              .maybeSingle<AlertItem>();

            setDashboardState((prev) => {
              if (prev.status !== "ready") return prev;
              if (!error && authorizedAlert) {
                // Alert is visible -> update in list
                const updatedList = prev.data.alerts.map((a) =>
                  a.id === authorizedAlert.id ? authorizedAlert : a
                );
                if (!prev.data.alerts.some((a) => a.id === authorizedAlert.id)) {
                  updatedList.unshift(authorizedAlert);
                }
                updatedList.sort(
                  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );
                return {
                  ...prev,
                  data: { ...prev.data, alerts: updatedList },
                };
              } else {
                // Alert is no longer visible under RLS -> remove it
                return {
                  ...prev,
                  data: {
                    ...prev.data,
                    alerts: prev.data.alerts.filter((a) => a.id !== updatedId),
                  },
                };
              }
            });
            setLiveEventBanner(`Alert updated in real-time: ${payload.new?.title ?? updatedId}`);
            setTimeout(() => setLiveEventBanner(null), 5000);
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id?: string })?.id;
            if (!deletedId) return;

            setDashboardState((prev) => {
              if (prev.status !== "ready") return prev;
              return {
                ...prev,
                data: {
                  ...prev.data,
                  alerts: prev.data.alerts.filter((a) => a.id !== deletedId),
                },
              };
            });
            setLiveEventBanner("Alert withdrawn/deleted in real-time.");
            setTimeout(() => setLiveEventBanner(null), 5000);
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeStatus("error");
        } else if (status === "CLOSED") {
          setRealtimeStatus("disconnected");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profileId]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!selectedScenarioId) {
      return;
    }

    let isCurrent = true;

    const engine = new ScenarioEngine(supabase);
    engine.getIntelligence(selectedScenarioId).then((result) => {
      if (isCurrent) {
        setScenarioIntelligence(result);
        setIsEngineLoading(false);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [selectedScenarioId]);

  async function handleLogout() {
    setIsLoggingOut(true);
    const { error } = await supabase.auth.signOut();

    if (error) {
      setDashboardState({
        status: "error",
        message: "We could not end this session. Please try logging out again.",
      });
      setIsLoggingOut(false);
      return;
    }

    router.replace("/login");
  }

  function handleRetry() {
    setDashboardState({ status: "loading" });
    void fetchDashboard()
      .then((nextState) => {
        if (nextState) {
          setDashboardState(nextState);
        }
      })
      .catch(() => {
        setDashboardState({
          status: "error",
          message: "Sentinel could not load the dashboard. Please retry or sign in again.",
        });
      });
  }

  if (dashboardState.status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div aria-live="polite" className="text-center">
          <div className="mx-auto mb-5 h-9 w-9 animate-spin rounded-full border-4 border-teal-300/30 border-t-teal-300" />
          <p className="text-sm font-medium text-slate-200">Loading Sentinel intelligence workspace...</p>
        </div>
      </main>
    );
  }

  if (dashboardState.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-slate-900">
        <section className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl shadow-black/30 sm:p-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 font-bold text-rose-700">
            !
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">Workspace unavailable</h1>
          <p className="mt-3 leading-7 text-slate-600">{dashboardState.message}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 focus:outline-none focus:ring-4 focus:ring-teal-500/30 cursor-pointer"
              onClick={handleRetry}
              type="button"
            >
              Retry
            </button>
            <button
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200 cursor-pointer"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
              type="button"
            >
              {isLoggingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  const { profile, metrics, alerts, habitations, hazards, riskAssessments, roads, routes, scenarios, relocationSites } =
    dashboardState.data;

  const activeAlertsCount = alerts.filter((a) => a.active).length;

  async function handleResolveScenario(scenarioId: string) {
    const { error } = await supabase.from('scenarios').update({ status: 'resolved' }).eq('id', scenarioId);
    if (error) {
      alert("Failed to resolve scenario: " + error.message);
      return;
    }
    const engine = new ScenarioEngine(supabase);
    const updatedIntel = await engine.getIntelligence(scenarioId);
    setScenarioIntelligence(updatedIntel);
    fetchDashboard();
  }

  async function handleUpdateActionPlanStatus(planId: string, newStatus: string) {
    const { error } = await supabase.from('action_plans').update({ status: newStatus }).eq('id', planId);
    if (error) {
      alert("Failed to update action plan status: " + error.message);
      return;
    }
    if (selectedScenarioId) {
      const engine = new ScenarioEngine(supabase);
      const updatedIntel = await engine.getIntelligence(selectedScenarioId);
      setScenarioIntelligence(updatedIntel);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      {/* Top Header */}
      <header className="border-b border-white/10 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500 text-base font-bold shadow-lg shadow-teal-500/20">
              A
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide">AROVIA SENTINEL</p>
              <p className="text-xs text-slate-400">Disaster Intelligence & Geospatial Early Warning</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <RealtimeIndicator status={realtimeStatus} />
            <div className="hidden sm:block text-right border-l border-slate-800 pl-4">
              <p className="text-xs text-slate-400">{profile.email}</p>
              <span className="inline-block mt-0.5 rounded-md bg-teal-500/20 px-2 py-0.5 text-[11px] font-semibold text-teal-300">
                {roleLabels[profile.role]}
              </span>
            </div>
            <button
              className="rounded-lg border border-slate-700 px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-500/30 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
              type="button"
            >
              {isLoggingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        {/* Live Event Notification Banner */}
        {liveEventBanner ? (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-teal-300 bg-teal-900/90 px-5 py-3.5 text-white shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2.5 text-sm font-medium">
              <span className="h-2.5 w-2.5 rounded-full bg-teal-300 animate-ping" />
              <span>{liveEventBanner}</span>
            </div>
            <button
              className="rounded-md p-1 text-teal-200 hover:text-white transition cursor-pointer text-xs"
              onClick={() => setLiveEventBanner(null)}
              type="button"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {/* Welcome Banner */}
        <section className="rounded-3xl bg-[linear-gradient(120deg,#0f766e,#115e59_55%,#0f172a)] p-6 text-white shadow-xl shadow-teal-950/10 sm:p-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-teal-200 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-300 animate-pulse" />
                {roleLabels[profile.role]}
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Welcome back, {profile.full_name}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-teal-100 sm:text-base">
                {roleDescriptions[profile.role]}
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm md:text-right">
              <p className="text-xs font-medium uppercase tracking-wider text-teal-200">Alert Engine</p>
              <div className="mt-1 flex items-center md:justify-end gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-semibold text-white">Live Event Stream</span>
              </div>
              <p className="text-xs text-teal-200 mt-0.5">Database CDC Active</p>
            </div>
          </div>
        </section>

        {/* Metrics Grid */}
        <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Summary metrics">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Habitations</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {metrics.habitations.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500">Visible units</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Hazards</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-amber-600">
              {metrics.hazards.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500">Recorded events</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Risk Assessments</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-rose-600">
              {metrics.riskAssessments.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500">Evaluated risks</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Alerts</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-teal-700">
              {activeAlertsCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">{alerts.length} total visible</p>
          </article>
        </section>

        {/* Scope and Architecture Summary */}
        <section className="mt-6">
          <ScopeSummary profile={profile} />
        </section>

        {/* Navigation Tabs */}
        <nav aria-label="Dashboard views" className="mt-8 border-b border-slate-200">
          <div className="flex gap-2 sm:gap-6 overflow-x-auto pb-px">
            <button
              className={`pb-3 text-sm font-semibold transition border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === "overview"
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setActiveTab("overview")}
              type="button"
            >
              Overview & Map
            </button>
            <button
              className={`pb-3 text-sm font-semibold transition border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                activeTab === "scenario"
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setActiveTab("scenario")}
              type="button"
            >
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Scenario Intelligence
            </button>
            <button
              className={`pb-3 text-sm font-semibold transition border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === "map"
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setActiveTab("map")}
              type="button"
            >
              Full Geospatial Map
            </button>
            <button
              className={`pb-3 text-sm font-semibold transition border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                activeTab === "alerts"
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setActiveTab("alerts")}
              type="button"
            >
              <span>Disaster Alerts ({alerts.length})</span>
              {realtimeStatus === "connected" ? (
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Live stream active" />
              ) : null}
            </button>
            <button
              className={`pb-3 text-sm font-semibold transition border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === "habitations"
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setActiveTab("habitations")}
              type="button"
            >
              Habitations Directory ({habitations.length})
            </button>
            <button
              className={`pb-3 text-sm font-semibold transition border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === "hazards"
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setActiveTab("hazards")}
              type="button"
            >
              Hazards & Risk Matrix ({hazards.length})
            </button>
          </div>
        </nav>

        {/* Tab 1: Overview (Map + Recent Alerts) */}
        {activeTab === "overview" ? (
          <section className="mt-6 space-y-8">
            {/* Embedded Spatial Map */}
            <DisasterMap
              habitations={habitations}
              hazards={hazards}
              riskAssessments={riskAssessments}
              roads={roads}
              routes={routes}
              scenarios={scenarios}
              relocationSites={relocationSites}
            />

            {/* Quick Alerts Summary */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">Broadcast Alerts Feed</h2>
                    <RealtimeIndicator status={realtimeStatus} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Live advisories scoped to {roleLabels[profile.role].toLowerCase()} via database RLS.
                  </p>
                </div>
                <button
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
                  onClick={() => setActiveTab("alerts")}
                  type="button"
                >
                  View all ({alerts.length}) →
                </button>
              </div>

              {alerts.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  No active broadcast alerts for this access level.
                </div>
              ) : (
                <div className="mt-6 divide-y divide-slate-100">
                  {alerts.slice(0, 3).map((alert) => (
                    <article className="py-3.5 first:pt-0 last:pb-0" key={alert.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-md border px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${getSeverityBadge(
                              alert.severity,
                            )}`}
                          >
                            {alert.severity}
                          </span>
                          <span
                            className={`rounded-md border px-2 py-0.5 text-xs font-medium ${getAudienceBadge(
                              alert.audience,
                            )}`}
                          >
                            Audience: {alert.audience}
                          </span>
                          {alert.active ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Inactive</span>
                          )}
                        </div>
                        <time className="text-xs text-slate-400" dateTime={alert.created_at}>
                          {new Date(alert.created_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </time>
                      </div>
                      <h3 className="mt-1.5 text-sm font-semibold text-slate-900">{alert.title}</h3>
                      <p className="mt-0.5 text-xs text-slate-600 leading-relaxed line-clamp-2">{alert.message}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {/* Tab: Scenario Intelligence */}
        {activeTab === "scenario" ? (
          <section className="mt-6 space-y-6">
            {isDrawingScenario ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <DisasterMap
                  habitations={habitations}
                  hazards={hazards}
                  riskAssessments={riskAssessments}
                  roads={roads}
                  routes={routes}
                  scenarios={scenarios}
                  relocationSites={relocationSites}
                  drawingMode={true}
                  onPolygonDrawn={(geoJson) => {
                    setDrawnScenarioGeoJson(geoJson);
                    setIsDrawingScenario(false);
                    setIsScenarioModalOpen(true);
                  }}
                />
                <button 
                  onClick={() => setIsDrawingScenario(false)} 
                  className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold transition"
                >
                  Cancel Drawing
                </button>
              </div>
            ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Scenario Intelligence Engine</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Deterministic operational view generated from real PostGIS intersections and RLS constraints.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto min-w-[280px]">
                  {(profile.role === "city" || profile.role === "state") && (
                    <button
                      className="whitespace-nowrap px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
                      onClick={() => setIsDrawingScenario(true)}
                    >
                      + Create Scenario
                    </button>
                  )}
                  <select
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    onChange={(e) => {
                      const val = e.target.value || null;
                      if (val) setIsEngineLoading(true);
                      setSelectedScenarioId(val);
                      if (!val) {
                        setScenarioIntelligence(null);
                        setIsEngineLoading(false);
                      }
                    }}
                    value={selectedScenarioId ?? ""}
                  >
                    <option value="">-- Select a Scenario to Analyze --</option>
                    {scenarios.map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {sc.name} ({sc.hazard_type.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedScenarioId && !isEngineLoading && scenarioIntelligence ? (
                <div className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-2">
                  {/* Scenario Status and Actions */}
                  <div className="flex items-center justify-between rounded-xl bg-white p-5 border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        scenarioIntelligence.scenario.status === 'active' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                        scenarioIntelligence.scenario.status === 'resolved' ? 'bg-slate-100 text-slate-800 border border-slate-200' :
                        'bg-slate-800 text-slate-200 border border-slate-700'
                      }`}>
                        {scenarioIntelligence.scenario.status}
                      </span>
                      <h3 className="text-sm font-semibold text-slate-700">Scenario Status</h3>
                    </div>
                    {(profile.role === "city" || profile.role === "state") && scenarioIntelligence.scenario.status === 'active' && (
                      <button
                        onClick={() => handleResolveScenario(scenarioIntelligence.scenario.id)}
                        className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition"
                      >
                        Mark as Resolved
                      </button>
                    )}
                  </div>

                  {/* Operational Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                      <p className="text-xs font-semibold uppercase text-slate-500">Severity</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900">Level {scenarioIntelligence.scenario.severity ?? '?'}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                      <p className="text-xs font-semibold uppercase text-slate-500">Habitations</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900">{scenarioIntelligence.habitations.length}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                      <p className="text-xs font-semibold uppercase text-slate-500">Hazards</p>
                      <p className="mt-1 text-2xl font-bold text-amber-600">{scenarioIntelligence.hazards.length}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                      <p className="text-xs font-semibold uppercase text-slate-500">Highest Risk</p>
                      <p className="mt-1 text-xl font-bold text-rose-600 truncate" title={scenarioIntelligence.riskAssessments.length > 0 ? scenarioIntelligence.riskAssessments.reduce((max, r) => (r.risk_score && max.risk_score && r.risk_score > max.risk_score) ? r : max, scenarioIntelligence.riskAssessments[0])?.risk_level ?? 'N/A' : 'N/A'}>
                        {scenarioIntelligence.riskAssessments.length > 0 
                          ? scenarioIntelligence.riskAssessments.reduce((max, r) => (r.risk_score && max.risk_score && r.risk_score > max.risk_score) ? r : max, scenarioIntelligence.riskAssessments[0])?.risk_level ?? 'N/A'
                          : 'N/A'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                      <p className="text-xs font-semibold uppercase text-slate-500">Active Alerts</p>
                      <p className="mt-1 text-2xl font-bold text-teal-700">{scenarioIntelligence.alerts.length}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                      <p className="text-xs font-semibold uppercase text-slate-500">Resources</p>
                      <p className="mt-1 text-2xl font-bold text-indigo-700">{scenarioIntelligence.resources.length}</p>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-slate-100 pt-6">
                    <h3 className="text-base font-bold text-slate-900 mb-4">Affected Area Map</h3>
                    <DisasterMap
                      habitations={scenarioIntelligence.habitations}
                      hazards={scenarioIntelligence.hazards}
                      riskAssessments={scenarioIntelligence.riskAssessments}
                      roads={roads}
                      routes={routes}
                      scenarios={[scenarioIntelligence.scenario]}
                      relocationSites={relocationSites}
                      activeScenarioMode={true}
                    />
                  </div>

                  {/* Emergency Action Plan Operations */}
                  <div className="mt-8 border-t border-slate-100 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">Emergency Action Plan Operations</h3>
                        <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-1 rounded-full border border-slate-200 mt-1 inline-block">
                          Total Actions: {scenarioIntelligence.actionPlans.length}
                        </span>
                      </div>
                      {(profile.role === "city" || profile.role === "state") && (
                        <button
                          className="px-3 py-1.5 bg-teal-600 text-white rounded text-sm font-semibold hover:bg-teal-700 transition"
                          onClick={() => setIsActionPlanModalOpen(true)}
                        >
                          + Add Action Plan
                        </button>
                      )}
                    </div>

                    {scenarioIntelligence.actionPlans.length > 0 ? (
                      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                        <table className="min-w-full divide-y divide-slate-200 text-sm text-left">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-3 font-semibold text-slate-600">Priority</th>
                              <th className="px-4 py-3 font-semibold text-slate-600">Action Required</th>
                              <th className="px-4 py-3 font-semibold text-slate-600">Scenario Context</th>
                              <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                              <th className="px-4 py-3 font-semibold text-slate-600 text-right">Team Assigned</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {scenarioIntelligence.actionPlans.map((plan) => (
                              <tr key={plan.id} className="hover:bg-slate-50/50">
                                <td className="px-4 py-3 align-top">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getActionPriorityColor(
                                      plan.priority
                                    )}`}
                                  >
                                    {getActionPriorityLabel(plan.priority)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-medium text-slate-900 align-top">
                                  {plan.action}
                                </td>
                                <td className="px-4 py-3 text-slate-500 align-top">
                                  {scenarioIntelligence.scenario.name}
                                </td>
                                <td className="px-4 py-3 align-top">
                                  {(profile.role === "city" || profile.role === "state") ? (
                                    <select
                                      value={plan.status}
                                      onChange={(e) => handleUpdateActionPlanStatus(plan.id, e.target.value)}
                                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-teal-500 focus:outline-none"
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="in_progress">In Progress</option>
                                      <option value="completed">Completed</option>
                                    </select>
                                  ) : (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                                      plan.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                      plan.status === 'in_progress' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                                      'bg-slate-50 text-slate-700 border-slate-200'
                                    }`}>
                                      {plan.status === 'in_progress' ? 'In Progress' : plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 align-top text-right">
                                  <span className="text-slate-400 italic text-xs">Not available</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                        No action plans found for this scenario.
                      </div>
                    )}
                  </div>

                  {/* Evacuation & Relocation Intelligence */}
                  <div className="mt-8 border-t border-slate-100 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-slate-900">Evacuation & Relocation Intelligence</h3>
                      <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-1 rounded-full border border-slate-200">
                        Habitations to Relocate: {scenarioIntelligence.evacuationPlans.length}
                      </span>
                    </div>

                    {scenarioIntelligence.evacuationPlans.length > 0 ? (
                      <div className="space-y-4">
                        {scenarioIntelligence.evacuationPlans.map((plan) => (
                          <div key={plan.habitation.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
                              <div>
                                <h4 className="text-sm font-bold text-slate-900">{plan.habitation.name}</h4>
                                <p className="text-xs text-slate-500">Population: {plan.habitation.population?.toLocaleString() ?? "Unknown"}</p>
                              </div>
                              <span className="bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded text-xs font-semibold">
                                {plan.candidates.length} candidates
                              </span>
                            </div>

                            {plan.candidates.length > 0 ? (
                              <div className="space-y-3">
                                {plan.candidates.map((candidate, idx) => (
                                  <div key={candidate.site_id} className={`flex flex-col sm:flex-row gap-3 sm:items-center justify-between p-3 rounded-lg border ${idx === 0 ? "border-teal-200 bg-teal-50/30" : "border-slate-100 bg-slate-50"}`}>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        {idx === 0 && <span className="bg-teal-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">Primary</span>}
                                        <p className="text-sm font-semibold text-slate-900">{candidate.site_name}</p>
                                      </div>
                                      <p className="text-xs text-slate-500 mt-1">
                                        Capacity: {candidate.capacity ?? "Not available"} • Suitability: {candidate.suitability ?? "Not available"} • Availability: <span className="italic text-slate-400">Not available</span>
                                      </p>
                                    </div>
                                    <div className="sm:text-right flex flex-col gap-1">
                                      <p className="text-sm font-bold text-slate-700">
                                        {(candidate.distance_meters / 1000).toFixed(2)} km
                                      </p>
                                      {candidate.route_id ? (
                                        <p className="text-xs font-medium text-sky-700 bg-sky-100 px-2 py-0.5 rounded inline-block self-start sm:self-end">
                                          Route: {candidate.route_distance} km • {candidate.route_time}
                                        </p>
                                      ) : (
                                        <p className="text-xs text-slate-400 italic">Route intelligence unavailable</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 italic">No suitable relocation sites found within range.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                        No habitations are within the affected area polygon.
                      </div>
                    )}
                  </div>

                  {/* Response Resource Intelligence */}
                  <div className="mt-8 border-t border-slate-100 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-slate-900">Response Resource & Team Intelligence</h3>
                      <div className="flex gap-2">
                        <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-1 rounded-full border border-slate-200">
                          {scenarioIntelligence.resources.length} Field Devices
                        </span>
                        <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-1 rounded-full border border-slate-200">
                          {scenarioIntelligence.safetyTeams.length} Safety Teams
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Field Devices */}
                      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h4 className="text-sm font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">
                          Deployed Field Devices (In Affected Area)
                        </h4>
                        {scenarioIntelligence.resources.length > 0 ? (
                          <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                            {scenarioIntelligence.resources.map((device) => (
                              <div key={device.id} className="p-3 rounded-lg border border-slate-100 bg-slate-50 flex justify-between items-center">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900 uppercase tracking-wide">{device.device_id}</p>
                                  <p className="text-xs text-slate-500 mt-1 capitalize">{device.type}</p>
                                </div>
                                <div className="text-right flex flex-col gap-1 items-end">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    device.status?.toLowerCase() === 'active' || device.status?.toLowerCase() === 'online'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : device.status?.toLowerCase() === 'offline'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-slate-200 text-slate-700'
                                  }`}>
                                    {device.status ?? "Status Unknown"}
                                  </span>
                                  <span className="text-[10px] text-slate-400 italic">Telemetry not available</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic text-center py-4">No field devices deployed in the affected area.</p>
                        )}
                      </div>

                      {/* Safety Teams */}
                      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h4 className="text-sm font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">
                          Available Regional Safety Teams
                        </h4>
                        {scenarioIntelligence.safetyTeams.length > 0 ? (
                          <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                            {scenarioIntelligence.safetyTeams.map((team) => (
                              <div key={team.id} className="p-3 rounded-lg border border-slate-100 bg-slate-50">
                                <div className="flex justify-between items-start mb-1">
                                  <p className="text-sm font-semibold text-slate-900">{team.name}</p>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200">
                                    {team.type}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center mt-2">
                                  <p className="text-xs text-slate-600">
                                    <span className="font-medium text-slate-500">Contact:</span> {team.contact ?? <span className="italic text-slate-400">Not available</span>}
                                  </p>
                                  <span className="text-[10px] text-slate-400 italic">Location not available</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic text-center py-4">No safety teams registered in the system.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : selectedScenarioId && isEngineLoading ? (
                <div className="mt-12 mb-12 flex flex-col items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-300/30 border-t-teal-300" />
                  <p className="mt-4 text-sm font-medium text-slate-500">Running spatial intelligence engine...</p>
                </div>
              ) : (
                <div className="mt-12 mb-12 text-center text-sm text-slate-500">
                  Select a scenario from the dropdown above to generate an intelligence view.
                </div>
              )}
            </div>
            )}
          </section>
        ) : null}

        {/* Tab 2: Full Map View */}
        {activeTab === "map" ? (
          <section className="mt-6">
            <DisasterMap
              habitations={habitations}
              hazards={hazards}
              riskAssessments={riskAssessments}
              roads={roads}
              routes={routes}
              scenarios={scenarios}
              relocationSites={relocationSites}
            />
          </section>
        ) : null}

        {/* Tab 3: Disaster Alerts */}
        {activeTab === "alerts" ? (
          <section className="mt-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-slate-900">Disaster & Advisory Alerts</h2>
                    <RealtimeIndicator status={realtimeStatus} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Live events and advisories streamed over WebSocket for {roleLabels[profile.role].toLowerCase()}.
                  </p>
                </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {alerts.length} visible
                    </span>
                    {profile.role !== "public" && (
                      <button
                        onClick={() => {
                          setEditingAlert(undefined);
                          setIsAlertModalOpen(true);
                        }}
                        className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 transition cursor-pointer"
                      >
                        + Create Alert
                      </button>
                    )}
                  </div>
                </div>

              {alerts.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  No alerts currently broadcasted to your access level.
                </div>
              ) : (
                <div className="mt-6 divide-y divide-slate-100">
                  {alerts.map((alert) => (
                    <article className="py-4 first:pt-0 last:pb-0" key={alert.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-md border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${getSeverityBadge(
                              alert.severity,
                            )}`}
                          >
                            {alert.severity}
                          </span>
                          <span
                            className={`rounded-md border px-2 py-0.5 text-xs font-medium ${getAudienceBadge(
                              alert.audience,
                            )}`}
                          >
                            Audience: {alert.audience}
                          </span>
                          {alert.active ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Inactive</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <time className="text-xs text-slate-400" dateTime={alert.created_at}>
                            {new Date(alert.created_at).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </time>
                          {profile.role !== "public" &&
                            ((profile.role === "city" && (alert.audience === "city" || alert.audience === "public")) ||
                              (profile.role === "state" && (alert.audience === "state" || alert.audience === "public"))) && (
                              <button
                                onClick={() => {
                                  setEditingAlert(alert);
                                  setIsAlertModalOpen(true);
                                }}
                                className="text-xs font-semibold text-teal-700 hover:text-teal-900 transition underline cursor-pointer"
                              >
                                Edit
                              </button>
                            )}
                        </div>
                      </div>
                      <h3 className="mt-2 text-base font-semibold text-slate-900">{alert.title}</h3>
                      <p className="mt-1 text-sm text-slate-600 leading-relaxed">{alert.message}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {/* Tab 4: Habitations Directory */}
        {activeTab === "habitations" ? (
          <section className="mt-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Habitations Directory</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Geographic units within your administrative boundary permissions.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {habitations.length} Habitations
                </span>
              </div>

              {habitations.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  No habitations found within your assigned geographic scope.
                </div>
              ) : (
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3" scope="col">Habitation Name</th>
                        <th className="px-4 py-3" scope="col">District</th>
                        <th className="px-4 py-3" scope="col">State</th>
                        <th className="px-4 py-3 text-right" scope="col">Est. Population</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {habitations.map((hab) => (
                        <tr className="hover:bg-slate-50/80 transition" key={hab.id}>
                          <td className="px-4 py-3 font-semibold text-slate-900">{hab.name}</td>
                          <td className="px-4 py-3">{hab.district}</td>
                          <td className="px-4 py-3">{hab.state}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-800">
                            {hab.population !== null ? hab.population.toLocaleString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {/* Tab 5: Hazards & Risk Assessments */}
        {activeTab === "hazards" ? (
          <section className="mt-6 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Hazards & Risk Matrix</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Recorded hazard events and calculated risk assessments for visible habitations.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {profile.role !== "public" && (
                    <div className="flex gap-2 mr-2">
                      <button 
                        onClick={() => { setEditingHazard(undefined); setIsHazardModalOpen(true); }}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition"
                      >
                        + Log Hazard
                      </button>
                      <button 
                        onClick={() => { setEditingRisk(undefined); setIsRiskModalOpen(true); }}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition"
                      >
                        + Assess Risk
                      </button>
                    </div>
                  )}
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {hazards.length} Events
                  </span>
                </div>
              </div>

              {hazards.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  No hazards recorded for habitations within your scope.
                </div>
              ) : (
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3" scope="col">Hazard Classification</th>
                        <th className="px-4 py-3" scope="col">Severity</th>
                        <th className="px-4 py-3" scope="col">Affected Habitation</th>
                        <th className="px-4 py-3" scope="col">Event Time</th>
                        <th className="px-4 py-3 text-right" scope="col">Risk Evaluation</th>
                        {profile.role !== "public" && <th className="px-4 py-3 text-right" scope="col">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {hazards.map((hazard) => {
                        const linkedRisk = riskAssessments.find(
                          (r) => r.hazard_id === hazard.id,
                        );
                        return (
                          <tr className="hover:bg-slate-50/80 transition" key={hazard.id}>
                            <td className="px-4 py-3 font-semibold capitalize text-slate-900">
                              {hazard.type.replace(/_/g, " ")}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block rounded-md border px-2 py-0.5 text-xs font-bold ${getSeverityBadge(
                                  hazard.severity,
                                )}`}
                              >
                                Level {hazard.severity}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {hazard.habitation_name ?? "—"}
                              {hazard.habitation_district ? (
                                <span className="block text-xs font-normal text-slate-400">
                                  {hazard.habitation_district}, {hazard.habitation_state}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">
                              {new Date(hazard.event_time).toLocaleString(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {linkedRisk ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <span
                                    className={`rounded-md border px-2 py-0.5 text-xs font-bold capitalize ${getSeverityBadge(
                                      linkedRisk.risk_level ?? "medium",
                                    )}`}
                                  >
                                    {linkedRisk.risk_level ?? "Assessed"}
                                  </span>
                                  {linkedRisk.risk_score !== null ? (
                                    <span className="font-mono text-xs font-semibold text-slate-800">
                                      {linkedRisk.risk_score}
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">Pending</span>
                              )}
                            </td>
                            {profile.role !== "public" && (
                              <td className="px-4 py-3 text-right">
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => {
                                      setEditingHazard(hazard);
                                      setIsHazardModalOpen(true);
                                    }}
                                    className="text-xs font-medium text-slate-500 hover:text-teal-600 transition"
                                  >
                                    Edit Hazard
                                  </button>
                                  {linkedRisk && (
                                    <button
                                      onClick={() => {
                                        setEditingRisk(linkedRisk);
                                        setIsRiskModalOpen(true);
                                      }}
                                      className="text-xs font-medium text-slate-500 hover:text-indigo-600 transition"
                                    >
                                      Edit Risk
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>

      {/* Modals */}
      {isHazardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <HazardForm
            habitations={habitations}
            existingHazard={editingHazard}
            onSuccess={() => {
              setIsHazardModalOpen(false);
              fetchDashboard(); // Refresh
            }}
            onCancel={() => setIsHazardModalOpen(false)}
          />
        </div>
      )}

      {isRiskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <RiskAssessmentForm
            hazards={hazards}
            existingRiskAssessment={editingRisk}
            onSuccess={() => {
              setIsRiskModalOpen(false);
              fetchDashboard(); // Refresh
            }}
            onCancel={() => setIsRiskModalOpen(false)}
          />
        </div>
      )}
      {isAlertModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <AlertForm
            initialData={editingAlert}
            userRole={profile.role}
            onSuccess={() => {
              setIsAlertModalOpen(false);
              setEditingAlert(undefined);
              // Realtime takes care of updating the state, so we don't strictly need fetchDashboard()
              // but we can call it to be safe, or just rely on realtime.
            }}
            onCancel={() => {
              setIsAlertModalOpen(false);
              setEditingAlert(undefined);
            }}
          />
        </div>
      )}

    </main>
  );
}
