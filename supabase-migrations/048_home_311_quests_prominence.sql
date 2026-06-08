-- 048_home_311_quests_prominence.sql — Make sure Civic Quests and 311 are
-- treated with the same callout-importance as StreetBeats / Room Reservations
-- on the seeded home page row. Idempotent.

-- 1) Portal cards: ensure 311 + Quests are present AND ordered near the top.
-- Strategy: remove any existing report311/quests items, then prepend fresh
-- copies right after the first card (members). User can re-order afterwards
-- from the home editor.
update public.home_page_content
set sections = (
  select jsonb_agg(
    case
      when section->>'type' = 'portal_cards' then
        jsonb_set(
          section,
          '{items}',
          (
            with base as (
              select item, ord
              from jsonb_array_elements(section->'items')
                with ordinality as t(item, ord)
              where item->>'id' not in ('report311', 'quests')
            ),
            with_inserts as (
              select item, ord::numeric as ord from base
              union all
              select '{"id":"report311","title":"Report a Non-Emergency Issue","description":"See a pothole, graffiti, or park maintenance problem? Submit a 311 report with a photo and location, then track it from received to resolved.","link_to":"/report","link_text":"Report an Issue →","icon":"pin","color_theme":"amber"}'::jsonb, 1.3
              union all
              select '{"id":"quests","title":"Civic Quests","description":"Explore the city through guided quests — check in at landmarks, earn badges, and climb the public leaderboard.","link_to":"/explore","link_text":"Start Exploring →","icon":"award","color_theme":"indigo","requires_module":"civic_quests"}'::jsonb, 1.6
            )
            select jsonb_agg(item order by ord)
            from with_inserts
          )
        )
      else section
    end
  )
  from jsonb_array_elements(sections) section
)
where singleton = true;

-- 2) Hero secondary CTAs: ensure 311 + Quests are present and styled as
-- primary callouts (same prominence as StreetBeats / Rooms).
update public.home_page_content
set hero_secondary_ctas = (
  with cleaned as (
    select cta from jsonb_array_elements(hero_secondary_ctas) cta
    where cta->>'href' not in ('/report', '/explore')
  ),
  combined as (
    select cta, 2::numeric as ord from cleaned
    union all
    select '{"label":"Report an Issue (311)","href":"/report","style":"primary"}'::jsonb, 1.2
    union all
    select '{"label":"Civic Quests","href":"/explore","style":"primary","requires_module":"civic_quests"}'::jsonb, 1.5
  )
  select jsonb_agg(cta order by ord) from combined
)
where singleton = true;
