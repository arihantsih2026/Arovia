-- =============================================================
-- Migration: Scenario Intelligence RPC v2
-- =============================================================
-- Updates the `get_scenario_intelligence` function to also include
-- `action_plans` associated with the scenario.
-- =============================================================

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

    -- 6. Find available response resources
    SELECT COALESCE(json_agg(row_to_json(fd)), '[]'::json) INTO v_response_resources
    FROM (
        SELECT id, device_id, type, status, location
        FROM public.field_devices
        WHERE ST_Intersects(location, v_scenario.affected_area)
    ) fd;

    -- 7. Find associated action plans (Order by priority ascending - assuming 1 is highest)
    SELECT COALESCE(json_agg(row_to_json(ap)), '[]'::json) INTO v_action_plans
    FROM (
        SELECT id, scenario_id, action, priority, created_at
        FROM public.action_plans
        WHERE scenario_id = p_scenario_id
        ORDER BY priority ASC NULLS LAST
    ) ap;

    -- 8. Construct final JSON result
    v_result := json_build_object(
        'scenario', row_to_json(v_scenario),
        'habitations', v_affected_habitations,
        'hazards', v_relevant_hazards,
        'riskAssessments', v_risk_assessments,
        'alerts', v_relevant_alerts,
        'resources', v_response_resources,
        'actionPlans', v_action_plans
    );

    RETURN v_result;
END;
$$;
