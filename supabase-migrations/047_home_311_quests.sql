-- 047_home_311_quests.sql — Add Civic Quests and 311 Report entries to the
-- seeded home page content (hero CTAs and portal cards). Idempotent: safely
-- inserts each entry only if not already present.

-- Hero secondary CTAs — append 311 + Civic Quests if missing.
update public.home_page_content
set hero_secondary_ctas = (
  select jsonb_agg(elem) from (
    select elem from jsonb_array_elements(hero_secondary_ctas) elem
    union all
    select '{"label":"Report an Issue (311)","href":"/report"}'::jsonb
    where not exists (
      select 1 from jsonb_array_elements(hero_secondary_ctas) e
      where e->>'href' = '/report'
    )
    union all
    select '{"label":"Civic Quests","href":"/explore","requires_module":"civic_quests"}'::jsonb
    where not exists (
      select 1 from jsonb_array_elements(hero_secondary_ctas) e
      where e->>'href' = '/explore'
    )
  ) sub
)
where singleton = true;

-- Portal cards section — append 311 + Civic Quests cards if missing.
update public.home_page_content
set sections = (
  select jsonb_agg(
    case
      when section->>'type' = 'portal_cards' then
        jsonb_set(
          section,
          '{items}',
          (
            select jsonb_agg(item) from (
              select item from jsonb_array_elements(section->'items') item
              union all
              select '{"id":"report311","title":"Report a Non-Emergency Issue","description":"See a pothole, graffiti, or park maintenance problem? Submit a 311 report with a photo and location, then track it from received to resolved.","link_to":"/report","link_text":"Report an Issue →","icon":"pin","color_theme":"amber"}'::jsonb
              where not exists (
                select 1 from jsonb_array_elements(section->'items') i
                where i->>'id' = 'report311'
              )
              union all
              select '{"id":"quests","title":"Civic Quests","description":"Explore the city through guided quests — check in at landmarks, earn badges, and climb the public leaderboard.","link_to":"/explore","link_text":"Start Exploring →","icon":"award","color_theme":"indigo","requires_module":"civic_quests"}'::jsonb
              where not exists (
                select 1 from jsonb_array_elements(section->'items') i
                where i->>'id' = 'quests'
              )
            ) sub
          )
        )
      else section
    end
  )
  from jsonb_array_elements(sections) section
)
where singleton = true;
