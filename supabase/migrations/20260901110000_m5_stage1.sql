-- =============================================================
-- Migration: M5 Stage 1 - Incident Lifecycle & Action Plan Execution
-- =============================================================
-- Adds status tracking to scenarios and action_plans with check constraints.
-- Existing rows are given the default values.
-- Updates get_scenario_intelligence RPC to return action_plans.status.
-- =============================================================

-- 1. Scenarios Status
ALTER TABLE public.scenarios 
ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
CHECK (status IN ('active', 'resolved', 'archived'));

-- 2. Action Plans Status
ALTER TABLE public.action_plans 
ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
CHECK (status IN ('pending', 'in_progress', 'completed'));

-- 3. Update Scenario Intelligence RPC
CREATE OR REPLACE FUNCTION get_scenario_intelligence(p_scenario_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_scenario record;
    v_affected_habitations json;
    v_relevant_hazards json;
    v_risk_assessments json;
    v_relevant_alerts json;
    v_response_resources json;
    v_action_plans json;
    v_evacuation_plans json;
    v_safety_teams json;
    v_result json;
BEGIN
    -- 1. Get the scenario
    SELECT * INTO v_scenario
    FROM public.scenarios
    WHERE id = p_scenario_id;

    IF v_scenario IS NULL THEN
        RAISE EXCEPTION 'Scenario not found or access denied';
    END IF;

    -- 2. Find affected habitations
    SELECT COALESCE(json_agg(row_to_json(h)), '[]'::json) INTO v_affected_habitations
    FROM (
        SELECT id, name, district, state, population, location
        FROM public.habitations
        WHERE ST_Intersects(location, v_scenario.affected_area)
    ) h;

    -- 3. Find related hazards
    SELECT COALESCE(json_agg(row_to_json(hz)), '[]'::json) INTO v_relevant_hazards
    FROM (
        SELECT hz.id, hz.habitation_id, hz.type, hz.severity, hz.event_time
        FROM public.hazards hz
        JOIN public.habitations h ON hz.habitation_id = h.id
        WHERE ST_Intersects(h.location, v_scenario.affected_area)
    ) hz;

    -- 4. Find related risk assessments
    SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) INTO v_risk_assessments
    FROM (
        SELECT r.id, r.hazard_id, r.risk_score, r.risk_level, r.assessed_at
        FROM public.risk_assessments r
        JOIN public.hazards hz ON r.hazard_id = hz.id
        JOIN public.habitations h ON hz.habitation_id = h.id
        WHERE ST_Intersects(h.location, v_scenario.affected_area)
    ) r;

    -- 5. Find relevant active alerts
    SELECT COALESCE(json_agg(row_to_json(a)), '[]'::json) INTO v_relevant_alerts
    FROM (
        SELECT id, title, message, severity, audience, active, created_at, location
        FROM public.alerts
        WHERE active = true
        AND (
            location IS NULL 
            OR ST_Intersects(location, v_scenario.affected_area)
        )
    ) a;

    -- 6. Find available response resources (Field Devices)
    SELECT COALESCE(json_agg(row_to_json(fd)), '[]'::json) INTO v_response_resources
    FROM (
        SELECT id, device_id, type, status, location
        FROM public.field_devices
        WHERE ST_Intersects(location, v_scenario.affected_area)
    ) fd;

    -- 7. Find associated action plans (Updated to include status)
    SELECT COALESCE(json_agg(row_to_json(ap)), '[]'::json) INTO v_action_plans
    FROM (
        SELECT id, scenario_id, action, priority, status, created_at
        FROM public.action_plans
        WHERE scenario_id = p_scenario_id
        ORDER BY priority ASC NULLS LAST
    ) ap;

    -- 8. Compute Evacuation & Relocation Intelligence
    -- For each affected habitation, find the closest candidate relocation sites and routes
    SELECT COALESCE(json_agg(
        json_build_object(
            'habitation', row_to_json(h_outer),
            'candidates', (
                SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json)
                FROM (
                    SELECT
                        rs.id AS site_id,
                        rs.name AS site_name,
                        rs.capacity,
                        rs.suitability,
                        rs.location AS site_location,
                        ST_Distance(h_outer.location, rs.location) AS distance_meters,
                        rt.id AS route_id,
                        rt.distance AS route_distance,
                        rt.estimated_time AS route_time
                    FROM public.relocation_sites rs
                    -- Match existing route based on spatial endpoint proximity (10 meters)
                    LEFT JOIN public.routes rt ON 
                        ST_DWithin(rt.origin, h_outer.location, 10) AND 
                        ST_DWithin(rt.destination, rs.location, 10)
                    ORDER BY ST_Distance(h_outer.location, rs.location) ASC
                    LIMIT 3
                ) c
            )
        )
    ), '[]'::json) INTO v_evacuation_plans
    FROM (
        SELECT id, name, district, state, population, location
        FROM public.habitations
        WHERE ST_Intersects(location, v_scenario.affected_area)
    ) h_outer;

    -- 9. Find available safety teams
    SELECT COALESCE(json_agg(row_to_json(st)), '[]'::json) INTO v_safety_teams
    FROM (
        SELECT id, name, type, contact, created_at
        FROM public.safety_teams
    ) st;

    -- 10. Construct final JSON result
    v_result := json_build_object(
        'scenario', row_to_json(v_scenario),
        'habitations', v_affected_habitations,
        'hazards', v_relevant_hazards,
        'riskAssessments', v_risk_assessments,
        'alerts', v_relevant_alerts,
        'resources', v_response_resources,
        'actionPlans', v_action_plans,
        'evacuationPlans', v_evacuation_plans,
        'safetyTeams', v_safety_teams
    );

    RETURN v_result;
END;
$$;
