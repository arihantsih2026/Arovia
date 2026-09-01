-- =============================================================
-- Migration: M4 Stage 2 Authoring (Scenarios & Action Plans)
-- =============================================================
-- Adds INSERT and UPDATE policies for scenarios and action_plans
-- while strictly enforcing administrative geographic scopes using
-- PostGIS ST_Intersects and existing habitations data.
-- =============================================================

SET search_path = public, extensions;

-- -------------------------------------------------------------
-- Scenarios Policies
-- -------------------------------------------------------------
-- A scenario can be created/updated by a city/state user if its
-- affected_area intersects at least one habitation within their
-- scope, AND does NOT intersect any habitation outside their scope.

CREATE POLICY scenarios_insert_scoped
    ON public.scenarios
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND EXISTS (
                SELECT 1 FROM public.habitations h
                WHERE h.district = (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
                AND ST_Intersects(h.location, affected_area)
            )
            AND NOT EXISTS (
                SELECT 1 FROM public.habitations h
                WHERE h.district != (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
                AND ST_Intersects(h.location, affected_area)
            )
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND EXISTS (
                SELECT 1 FROM public.habitations h
                WHERE h.state = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
                AND ST_Intersects(h.location, affected_area)
            )
            AND NOT EXISTS (
                SELECT 1 FROM public.habitations h
                WHERE h.state != (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
                AND ST_Intersects(h.location, affected_area)
            )
        )
    );

CREATE POLICY scenarios_update_scoped
    ON public.scenarios
    FOR UPDATE
    TO authenticated
    USING (
        (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND EXISTS (
                SELECT 1 FROM public.habitations h
                WHERE h.district = (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
                AND ST_Intersects(h.location, affected_area)
            )
            AND NOT EXISTS (
                SELECT 1 FROM public.habitations h
                WHERE h.district != (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
                AND ST_Intersects(h.location, affected_area)
            )
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND EXISTS (
                SELECT 1 FROM public.habitations h
                WHERE h.state = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
                AND ST_Intersects(h.location, affected_area)
            )
            AND NOT EXISTS (
                SELECT 1 FROM public.habitations h
                WHERE h.state != (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
                AND ST_Intersects(h.location, affected_area)
            )
        )
    )
    WITH CHECK (
        (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND EXISTS (
                SELECT 1 FROM public.habitations h
                WHERE h.district = (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
                AND ST_Intersects(h.location, affected_area)
            )
            AND NOT EXISTS (
                SELECT 1 FROM public.habitations h
                WHERE h.district != (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
                AND ST_Intersects(h.location, affected_area)
            )
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND EXISTS (
                SELECT 1 FROM public.habitations h
                WHERE h.state = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
                AND ST_Intersects(h.location, affected_area)
            )
            AND NOT EXISTS (
                SELECT 1 FROM public.habitations h
                WHERE h.state != (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
                AND ST_Intersects(h.location, affected_area)
            )
        )
    );

-- -------------------------------------------------------------
-- Action Plans Policies
-- -------------------------------------------------------------

CREATE POLICY action_plans_insert_scoped
    ON public.action_plans
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.scenarios s
            WHERE s.id = scenario_id
            AND (
                (
                    (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
                    AND EXISTS (
                        SELECT 1 FROM public.habitations h
                        WHERE h.district = (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
                        AND ST_Intersects(h.location, s.affected_area)
                    )
                    AND NOT EXISTS (
                        SELECT 1 FROM public.habitations h
                        WHERE h.district != (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
                        AND ST_Intersects(h.location, s.affected_area)
                    )
                )
                OR (
                    (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
                    AND EXISTS (
                        SELECT 1 FROM public.habitations h
                        WHERE h.state = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
                        AND ST_Intersects(h.location, s.affected_area)
                    )
                    AND NOT EXISTS (
                        SELECT 1 FROM public.habitations h
                        WHERE h.state != (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
                        AND ST_Intersects(h.location, s.affected_area)
                    )
                )
            )
        )
    );

CREATE POLICY action_plans_update_scoped
    ON public.action_plans
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.scenarios s
            WHERE s.id = scenario_id
            AND (
                (
                    (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
                    AND EXISTS (
                        SELECT 1 FROM public.habitations h
                        WHERE h.district = (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
                        AND ST_Intersects(h.location, s.affected_area)
                    )
                    AND NOT EXISTS (
                        SELECT 1 FROM public.habitations h
                        WHERE h.district != (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
                        AND ST_Intersects(h.location, s.affected_area)
                    )
                )
                OR (
                    (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
                    AND EXISTS (
                        SELECT 1 FROM public.habitations h
                        WHERE h.state = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
                        AND ST_Intersects(h.location, s.affected_area)
                    )
                    AND NOT EXISTS (
                        SELECT 1 FROM public.habitations h
                        WHERE h.state != (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
                        AND ST_Intersects(h.location, s.affected_area)
                    )
                )
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.scenarios s
            WHERE s.id = scenario_id
            AND (
                (
                    (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
                    AND EXISTS (
                        SELECT 1 FROM public.habitations h
                        WHERE h.district = (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
                        AND ST_Intersects(h.location, s.affected_area)
                    )
                    AND NOT EXISTS (
                        SELECT 1 FROM public.habitations h
                        WHERE h.district != (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
                        AND ST_Intersects(h.location, s.affected_area)
                    )
                )
                OR (
                    (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
                    AND EXISTS (
                        SELECT 1 FROM public.habitations h
                        WHERE h.state = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
                        AND ST_Intersects(h.location, s.affected_area)
                    )
                    AND NOT EXISTS (
                        SELECT 1 FROM public.habitations h
                        WHERE h.state != (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
                        AND ST_Intersects(h.location, s.affected_area)
                    )
                )
            )
        )
    );
