-- Allow WPO outbound dispatch logs to reference either legacy community
-- events or city schedule sessions. The existing FK pointed only at
-- public.events, so normal TESS schedule events could fail before POSTing.

alter table public.integration_dispatches
  drop constraint if exists integration_dispatches_event_id_fkey;

notify pgrst, 'reload schema';