-- Editable home page content (singleton row) + reuse brand_versions for snapshots.

create table if not exists public.home_page_content (
  id uuid primary key default gen_random_uuid(),
  singleton boolean unique default true check (singleton),
  -- Hero
  hero_badge text,
  hero_title text not null default 'Community Event & Partnership Portal',
  hero_subtitle text,
  hero_authed_message text,
  hero_signup_cta_label text,
  hero_login_cta_label text,
  hero_primary_cta_label text,
  hero_primary_cta_href text,
  hero_secondary_ctas jsonb not null default '[]'::jsonb,
  -- Body blocks (ordered)
  sections jsonb not null default '[]'::jsonb,
  -- Footer
  footer_tagline text,
  footer_body text,
  footer_copyright text,
  -- Workflow
  draft jsonb,
  published_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

grant select on public.home_page_content to anon, authenticated;
grant all on public.home_page_content to service_role;

alter table public.home_page_content enable row level security;

drop policy if exists "Home content readable" on public.home_page_content;
create policy "Home content readable" on public.home_page_content
  for select to anon, authenticated using (true);

drop policy if exists "Admins write home content" on public.home_page_content;
create policy "Admins write home content" on public.home_page_content
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Extend brand_versions scope to include 'home'
alter table public.brand_versions
  drop constraint if exists brand_versions_scope_check;
alter table public.brand_versions
  add constraint brand_versions_scope_check
  check (scope in ('global','tenant','department','home'));

-- Seed singleton with current hardcoded values
insert into public.home_page_content (
  singleton, hero_badge, hero_title, hero_subtitle, hero_authed_message,
  hero_signup_cta_label, hero_login_cta_label,
  hero_secondary_ctas, sections,
  footer_tagline, footer_body, footer_copyright
) values (
  true,
  'Proof of Concept Demo',
  'Community Event & Partnership Portal',
  'Your central hub to discover local events, book municipal spaces, and partner with the city.',
  'One account, every program — apply as a musician, register a community org, book a room, and more.',
  'Create one account for everything',
  'Already have an account? Log in',
  '[
    {"label":"Upcoming Events","href":"/events","style":"primary"},
    {"label":"Businesses Hub","href":"/vendor","requires_module":"vendors_sponsors"},
    {"label":"Organizations Portal","href":"/community","requires_module":"community_orgs"},
    {"label":"StreetBeats Portal","href":"/streetbeats","requires_module":"streetbeats"},
    {"label":"Room Reservations","href":"/rooms","requires_module":"room_reservations"}
  ]'::jsonb,
  '[
    {
      "type":"portal_cards",
      "id":"portals",
      "items":[
        {"id":"members","title":"Community Members","description":"Browse the public directory to find upcoming literary series, workshops, and symposiums. Select an event, complete registration, and your digital ticket is delivered instantly.","link_to":"/events","link_text":"Event Directory →","icon":"ticket","color_theme":"emerald"},
        {"id":"biz","title":"Businesses","description":"Apply for vendor booths or purchase sponsorships. After city staff review, manage your logistics, booth assignment, and invoices from your partner dashboard.","link_to":"/vendor","link_text":"Partner Portal →","icon":"briefcase","color_theme":"amber","requires_module":"vendors_sponsors"},
        {"id":"orgs","title":"Organizations","description":"HOAs, nonprofits, and schools can submit events for the community calendar after city approval.","link_to":"/community","link_text":"Apply to Post →","icon":"users","color_theme":"green","requires_module":"community_orgs"},
        {"id":"rooms","title":"Room Reservations","description":"Browse available city meeting rooms. View the live 7-day availability grid, select your time, and submit a request. System validates instantly for conflicts.","link_to":"/rooms","link_text":"Reserve a Room →","icon":"building","color_theme":"cyan","requires_module":"room_reservations"},
        {"id":"musicians","title":"Musicians","description":"Join the city''s StreetBeats busking roster. Claim performance slots, build your profile, and connect your digital tip jar for direct fan support.","link_to":"/streetbeats","link_text":"Artist Portal →","icon":"music","color_theme":"pink","requires_module":"streetbeats"},
        {"id":"staff","title":"City Staff","description":"Access the Command Center to manage rosters, review applications, build floorplans, and track talent schedules.","link_to":"/staff","link_text":"Staff Ops →","icon":"clipboard","color_theme":"blue"}
      ]
    },
    {
      "type":"explainer_cards",
      "id":"how-it-works",
      "title":"How the System Works",
      "subtitle":"Choose your portal below to understand your unique workflow and capabilities within the platform.",
      "items":[
        {"id":"e1","title":"Public Attendees","color_theme":"emerald","steps":["Browse the public calendar — no account needed.","Click any event to see details, location, and ticket tiers.","Create a free account to RSVP and generate tickets.","Present your digital QR code at the door for entry."]},
        {"id":"e2","title":"Local Vendors","color_theme":"amber","steps":["Visit /vendor to create your business account.","Upload your EIN, insurance, and menu/merch photos.","Browse open city events and submit booth applications.","Check your dashboard for approval and load-in times."]},
        {"id":"e3","title":"Event Sponsors","color_theme":"indigo","steps":["Visit /sponsors to view available sponsorship tiers.","Select a tier for an upcoming event.","Submit your company logo and marketing materials.","Gain visibility on event pages, flyers, and digital maps."]},
        {"id":"e4","title":"Musicians","color_theme":"pink","steps":["Go to /streetbeats to apply for the StreetBeats program.","City staff reviews your audition and approves your profile.","Browse the Gig Pool and claim open public time slots.","Play your set and receive tips directly via your digital tip jar."]},
        {"id":"e5","title":"Community Orgs","color_theme":"green","steps":["Register your HOA or Nonprofit at /community.","City staff verifies your local community status (3-5 days).","Submit your free, public events via the community portal.","Events appear on the official city calendar once reviewed."]},
        {"id":"e6","title":"Room Bookings","color_theme":"cyan","steps":["Visit /rooms to view all bookable venues.","Select a room and view real-time availability.","Submit your request. The system instantly checks for overlaps and booking limits.","When approved, you will receive an email confirmation."]}
      ]
    }
  ]'::jsonb,
  'Proof of Concept Demonstration',
  'This platform is a functional prototype. No real transactions are processed, and all data is for demonstration purposes only.',
  'Municipal Solutions Platform'
)
on conflict (singleton) do nothing;
