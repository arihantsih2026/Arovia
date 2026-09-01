-- =============================================================
-- Migration: RLS Policies for alerts
-- =============================================================
-- This migration adds RLS policies for the alerts table only.
-- It does NOT modify any table definition, column, constraint,
-- index, or spatial type.  It does NOT modify the existing
-- RLS policies for the other 11 tables.
--
-- ENABLE ROW LEVEL SECURITY was already applied in the initial
-- schema migration — this migration only creates policies.
--
-- Design decisions:
--
-- 1. SELECT — audience-scoped for authenticated users:
--
--    The alerts table has an `audience` column constrained to
--    ('public', 'city', 'state') that explicitly defines the
--    target audience of each alert.  The architecture describes
--    alerts as "Safety/disaster alerts for appropriate roles."
--
--    Read access is scoped so that each user sees only the
--    alerts targeted at their role or at a broader audience:
--
--    - public-role users see alerts where audience = 'public'
--    - city-role users see alerts where audience IN ('public', 'city')
--    - state-role users see alerts where audience IN ('public', 'state')
--
--    This ensures that city-specific operational alerts are not
--    visible to public citizens, and state-level alerts are not
--    leaked to city teams that may not need them.
--
-- 2. INSERT / UPDATE / DELETE — service_role only:
--
--    The alerts table has no FK chain back to an
--    administratively scoped record (habitations.district /
--    habitations.state).  The established project convention
--    for tables without administrative-area scoping is:
--    writes are blocked for all authenticated users; only the
--    server-side service_role (which bypasses RLS) can create,
--    modify, or delete alerts.
--
--    This matches the pattern used for relocation_sites, roads,
--    routes, scenarios, action_plans, safety_teams, and
--    field_devices.
--
-- 3. Anonymous (anon) users have no policies and therefore no
--    access.  The service_role bypasses RLS entirely.
--
-- 4. No helper functions, views, triggers, new tables, or
--    new roles are created.
-- =============================================================


-- =============================================================
-- alerts — audience-scoped read access
-- =============================================================
-- Each authenticated user sees alerts targeted at their role
-- or at a broader audience level.
--
-- public-role users → audience = 'public'
-- city-role users   → audience IN ('public', 'city')
-- state-role users  → audience IN ('public', 'state')
--
-- No INSERT / UPDATE / DELETE policies — writes are restricted.
-- Server-side service_role bypasses RLS for alert management.
-- =============================================================

CREATE POLICY alerts_select_authenticated
    ON public.alerts
    FOR SELECT
    TO authenticated
    USING (
        (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'public'
            AND audience = 'public'
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
            AND audience IN ('public', 'city')
        )
        OR (
            (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
            AND audience IN ('public', 'state')
        )
    );
