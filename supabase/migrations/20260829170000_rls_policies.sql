-- =============================================================
-- Migration: Row Level Security Policies
-- =============================================================
-- This migration adds RLS policies to the 11 existing tables.
-- It does NOT modify any table definition, column, constraint,
-- index, or spatial type.
--
-- ENABLE ROW LEVEL SECURITY was already applied in the initial
-- schema migration — this migration only creates policies.
--
-- Design decisions:
--
-- 1. Three application roles defined in profiles.role:
--    public  — read-only access to disaster information
--    city    — read/write scoped to their assigned district
--    state   — read/write scoped to their assigned state
--
-- 2. Scope mapping:
--    profiles.city_id  ↔  habitations.district
--    profiles.state_id ↔  habitations.state
--
-- 3. Scoped write access applies only to tables with an
--    administrative scope column or FK chain back to one:
--    habitations, hazards, risk_assessments.
--
-- 4. Unscoped tables (relocation_sites, roads, routes,
--    scenarios, action_plans, safety_teams, field_devices)
--    are read-only for all authenticated users.  Writes are
--    restricted — only the server-side service_role (which
--    bypasses RLS) can modify these records.
--
-- 5. Profile provisioning is server-controlled.  No INSERT or
--    DELETE policy exists for profiles.  Users may update their
--    own profile row but cannot change role, city_id, or
--    state_id (escalation prevention).
--
-- 6. No helper functions, views, triggers, new tables, or
--    new roles are created.  Subqueries against profiles are
--    used directly in USING / WITH CHECK clauses.
--
-- 7. All policies target the 'authenticated' Supabase role.
--    Anonymous (anon) users have no policies and therefore no
--    access.  The service_role bypasses RLS entirely.
-- =============================================================


-- =============================================================
-- profiles
-- =============================================================
-- SELECT: every authenticated user sees their own row only.
-- UPDATE: own row only; role, city_id, state_id are immutable.
-- INSERT: none — profile creation is server-controlled.
-- DELETE: none — handled by auth.users ON DELETE CASCADE.
-- =============================================================

CREATE POLICY profiles_select_own
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (id = auth.uid());

CREATE POLICY profiles_update_own
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND role = (
            SELECT p.role
            FROM   public.profiles p
            WHERE  p.id = auth.uid()
        )
        AND city_id IS NOT DISTINCT FROM (
            SELECT p.city_id
            FROM   public.profiles p
            WHERE  p.id = auth.uid()
        )
        AND state_id IS NOT DISTINCT FROM (
            SELECT p.state_id
            FROM   public.profiles p
            WHERE  p.id = auth.uid()
        )
    );


-- =============================================================
-- habitations
-- =============================================================
-- SELECT:
--   public → all rows (disaster information is public-facing)
--   city   → rows where district = user's city_id
--   state  → rows where state = user's state_id
--
-- INSERT / UPDATE / DELETE:
--   city   → district must match user's city_id
--   state  → state must match user's state_id
--   public → no write access
--
-- UPDATE enforces scope on both USING (existing row) and
-- WITH CHECK (proposed new row) to prevent moving a record
-- out of the user's administrative area.
-- =============================================================

CREATE POLICY habitations_select_authenticated
    ON public.habitations
    FOR SELECT
    TO authenticated
    USING (
        (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'public'
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND district = (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND state = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
        )
    );

CREATE POLICY habitations_insert_scoped
    ON public.habitations
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND district = (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND state = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
        )
    );

CREATE POLICY habitations_update_scoped
    ON public.habitations
    FOR UPDATE
    TO authenticated
    USING (
        (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND district = (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND state = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
        )
    )
    WITH CHECK (
        (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND district = (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND state = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
        )
    );

CREATE POLICY habitations_delete_scoped
    ON public.habitations
    FOR DELETE
    TO authenticated
    USING (
        (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND district = (SELECT p.city_id FROM public.profiles p WHERE p.id = auth.uid())
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND state = (SELECT p.state_id FROM public.profiles p WHERE p.id = auth.uid())
        )
    );


-- =============================================================
-- hazards
-- =============================================================
-- Scoped via habitation_id → habitations.district / .state
--
-- SELECT:
--   public → all rows
--   city   → hazards whose habitation is in user's district
--   state  → hazards whose habitation is in user's state
--
-- INSERT / UPDATE / DELETE:
--   city/state → habitation_id must reference a habitation
--                within the user's administrative scope.
-- =============================================================

CREATE POLICY hazards_select_authenticated
    ON public.hazards
    FOR SELECT
    TO authenticated
    USING (
        (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'public'
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND habitation_id IN (
                SELECT h.id FROM public.habitations h
                WHERE  h.district = (
                    SELECT p.city_id FROM public.profiles p
                    WHERE  p.id = auth.uid()
                )
            )
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND habitation_id IN (
                SELECT h.id FROM public.habitations h
                WHERE  h.state = (
                    SELECT p.state_id FROM public.profiles p
                    WHERE  p.id = auth.uid()
                )
            )
        )
    );

CREATE POLICY hazards_insert_scoped
    ON public.hazards
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND habitation_id IN (
                SELECT h.id FROM public.habitations h
                WHERE  h.district = (
                    SELECT p.city_id FROM public.profiles p
                    WHERE  p.id = auth.uid()
                )
            )
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND habitation_id IN (
                SELECT h.id FROM public.habitations h
                WHERE  h.state = (
                    SELECT p.state_id FROM public.profiles p
                    WHERE  p.id = auth.uid()
                )
            )
        )
    );

CREATE POLICY hazards_update_scoped
    ON public.hazards
    FOR UPDATE
    TO authenticated
    USING (
        (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND habitation_id IN (
                SELECT h.id FROM public.habitations h
                WHERE  h.district = (
                    SELECT p.city_id FROM public.profiles p
                    WHERE  p.id = auth.uid()
                )
            )
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND habitation_id IN (
                SELECT h.id FROM public.habitations h
                WHERE  h.state = (
                    SELECT p.state_id FROM public.profiles p
                    WHERE  p.id = auth.uid()
                )
            )
        )
    )
    WITH CHECK (
        (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND habitation_id IN (
                SELECT h.id FROM public.habitations h
                WHERE  h.district = (
                    SELECT p.city_id FROM public.profiles p
                    WHERE  p.id = auth.uid()
                )
            )
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND habitation_id IN (
                SELECT h.id FROM public.habitations h
                WHERE  h.state = (
                    SELECT p.state_id FROM public.profiles p
                    WHERE  p.id = auth.uid()
                )
            )
        )
    );

CREATE POLICY hazards_delete_scoped
    ON public.hazards
    FOR DELETE
    TO authenticated
    USING (
        (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND habitation_id IN (
                SELECT h.id FROM public.habitations h
                WHERE  h.district = (
                    SELECT p.city_id FROM public.profiles p
                    WHERE  p.id = auth.uid()
                )
            )
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND habitation_id IN (
                SELECT h.id FROM public.habitations h
                WHERE  h.state = (
                    SELECT p.state_id FROM public.profiles p
                    WHERE  p.id = auth.uid()
                )
            )
        )
    );


-- =============================================================
-- risk_assessments
-- =============================================================
-- Scoped via hazard_id → hazards.habitation_id →
--   habitations.district / .state
--
-- SELECT:
--   public → all rows
--   city   → assessments whose hazard's habitation is in the
--            user's district
--   state  → assessments whose hazard's habitation is in the
--            user's state
--
-- INSERT / UPDATE / DELETE:
--   city/state → hazard_id must reference a hazard within the
--                user's administrative scope.
-- =============================================================

CREATE POLICY risk_assessments_select_authenticated
    ON public.risk_assessments
    FOR SELECT
    TO authenticated
    USING (
        (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'public'
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND hazard_id IN (
                SELECT hz.id FROM public.hazards hz
                WHERE  hz.habitation_id IN (
                    SELECT h.id FROM public.habitations h
                    WHERE  h.district = (
                        SELECT p.city_id FROM public.profiles p
                        WHERE  p.id = auth.uid()
                    )
                )
            )
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND hazard_id IN (
                SELECT hz.id FROM public.hazards hz
                WHERE  hz.habitation_id IN (
                    SELECT h.id FROM public.habitations h
                    WHERE  h.state = (
                        SELECT p.state_id FROM public.profiles p
                        WHERE  p.id = auth.uid()
                    )
                )
            )
        )
    );

CREATE POLICY risk_assessments_insert_scoped
    ON public.risk_assessments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND hazard_id IN (
                SELECT hz.id FROM public.hazards hz
                WHERE  hz.habitation_id IN (
                    SELECT h.id FROM public.habitations h
                    WHERE  h.district = (
                        SELECT p.city_id FROM public.profiles p
                        WHERE  p.id = auth.uid()
                    )
                )
            )
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND hazard_id IN (
                SELECT hz.id FROM public.hazards hz
                WHERE  hz.habitation_id IN (
                    SELECT h.id FROM public.habitations h
                    WHERE  h.state = (
                        SELECT p.state_id FROM public.profiles p
                        WHERE  p.id = auth.uid()
                    )
                )
            )
        )
    );

CREATE POLICY risk_assessments_update_scoped
    ON public.risk_assessments
    FOR UPDATE
    TO authenticated
    USING (
        (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND hazard_id IN (
                SELECT hz.id FROM public.hazards hz
                WHERE  hz.habitation_id IN (
                    SELECT h.id FROM public.habitations h
                    WHERE  h.district = (
                        SELECT p.city_id FROM public.profiles p
                        WHERE  p.id = auth.uid()
                    )
                )
            )
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND hazard_id IN (
                SELECT hz.id FROM public.hazards hz
                WHERE  hz.habitation_id IN (
                    SELECT h.id FROM public.habitations h
                    WHERE  h.state = (
                        SELECT p.state_id FROM public.profiles p
                        WHERE  p.id = auth.uid()
                    )
                )
            )
        )
    )
    WITH CHECK (
        (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND hazard_id IN (
                SELECT hz.id FROM public.hazards hz
                WHERE  hz.habitation_id IN (
                    SELECT h.id FROM public.habitations h
                    WHERE  h.district = (
                        SELECT p.city_id FROM public.profiles p
                        WHERE  p.id = auth.uid()
                    )
                )
            )
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND hazard_id IN (
                SELECT hz.id FROM public.hazards hz
                WHERE  hz.habitation_id IN (
                    SELECT h.id FROM public.habitations h
                    WHERE  h.state = (
                        SELECT p.state_id FROM public.profiles p
                        WHERE  p.id = auth.uid()
                    )
                )
            )
        )
    );

CREATE POLICY risk_assessments_delete_scoped
    ON public.risk_assessments
    FOR DELETE
    TO authenticated
    USING (
        (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND hazard_id IN (
                SELECT hz.id FROM public.hazards hz
                WHERE  hz.habitation_id IN (
                    SELECT h.id FROM public.habitations h
                    WHERE  h.district = (
                        SELECT p.city_id FROM public.profiles p
                        WHERE  p.id = auth.uid()
                    )
                )
            )
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND hazard_id IN (
                SELECT hz.id FROM public.hazards hz
                WHERE  hz.habitation_id IN (
                    SELECT h.id FROM public.habitations h
                    WHERE  h.state = (
                        SELECT p.state_id FROM public.profiles p
                        WHERE  p.id = auth.uid()
                    )
                )
            )
        )
    );


-- =============================================================
-- Unscoped tables — read-only for all authenticated users
-- =============================================================
-- These tables have no administrative scope column and no FK
-- chain back to an administratively scoped record.
-- Write operations are blocked (no matching policy = denied).
-- Server-side service_role bypasses RLS for provisioning.
-- =============================================================

-- relocation_sites --
CREATE POLICY relocation_sites_select_authenticated
    ON public.relocation_sites
    FOR SELECT
    TO authenticated
    USING (true);

-- roads --
CREATE POLICY roads_select_authenticated
    ON public.roads
    FOR SELECT
    TO authenticated
    USING (true);

-- routes --
CREATE POLICY routes_select_authenticated
    ON public.routes
    FOR SELECT
    TO authenticated
    USING (true);

-- scenarios --
CREATE POLICY scenarios_select_authenticated
    ON public.scenarios
    FOR SELECT
    TO authenticated
    USING (true);

-- action_plans --
CREATE POLICY action_plans_select_authenticated
    ON public.action_plans
    FOR SELECT
    TO authenticated
    USING (true);

-- safety_teams --
CREATE POLICY safety_teams_select_authenticated
    ON public.safety_teams
    FOR SELECT
    TO authenticated
    USING (true);

-- field_devices --
CREATE POLICY field_devices_select_authenticated
    ON public.field_devices
    FOR SELECT
    TO authenticated
    USING (true);
