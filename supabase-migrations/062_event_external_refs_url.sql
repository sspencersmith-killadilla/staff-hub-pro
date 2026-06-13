-- Add external_url to event_external_refs for WPO deep-link back to the item.
alter table public.event_external_refs
  add column if not exists external_url text;
