-- =============================================================
-- Migration: Enable Realtime Publication for public.alerts
-- =============================================================
-- Adds public.alerts to the supabase_realtime publication to enable
-- postgres_changes change data capture events over WebSockets.
--
-- This does NOT modify table schema, columns, indexes, or RLS policies.
-- Row Level Security remains strictly enforced.
-- =============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
