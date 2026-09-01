-- =============================================================
-- Migration: M4 Stage 3 - Alerts Mutation RLS Policies
-- =============================================================

-- City/State officials can insert alerts within their authorized audience scope
CREATE POLICY "alerts_insert_authenticated"
  ON public.alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
      AND audience IN ('public', 'city')
    )
    OR (
      (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
      AND audience IN ('public', 'state')
    )
  );

-- City/State officials can update alerts within their authorized audience scope
CREATE POLICY "alerts_update_authenticated"
  ON public.alerts
  FOR UPDATE
  TO authenticated
  USING (
    (
      (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
      AND audience IN ('public', 'city')
    )
    OR (
      (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
      AND audience IN ('public', 'state')
    )
  )
  WITH CHECK (
    (
      (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'city'
      AND audience IN ('public', 'city')
    )
    OR (
      (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) = 'state'
      AND audience IN ('public', 'state')
    )
  );
