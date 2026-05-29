## Goal

Let an admin edit every section of `/` (hero, portal cards, explainer cards, footer, plus optional custom sections) from `/staff/admin/home`, with a live side-by-side preview and the same Draft → Publish + version-history workflow as the Branding engine.

## Data model — migration `035_home_page_content.sql`

One singleton row + a snapshot table that mirrors the branding pattern.

```sql
create table public.home_page_content (
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
  hero_secondary_ctas jsonb not null default '[]',  -- [{label, href, requires_module?}]
  -- Sections (ordered, render in this order; hidden if disabled)
  sections jsonb not null default '[]',
  /* sections is an array of blocks. Supported block.type values:
     - "portal_cards":     { title?, items: [{id, title, description, link_to, link_text, icon, color_theme, requires_module?}] }
     - "explainer_cards":  { title?, subtitle?, items: [{id, title, color_theme, steps: string[]}] }
     - "rich_text":        { title?, body_md, background?, align? }
     - "image_banner":     { image_url, alt, caption?, href? }
     - "cta_band":         { headline, body?, buttons: [{label, href}], background? }
  */
  -- Footer
  footer_tagline text,
  footer_body text,
  footer_copyright text,
  -- Workflow
  draft jsonb,                -- full draft snapshot of the same shape
  published_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

grant select on public.home_page_content to anon, authenticated;
grant all on public.home_page_content to service_role;
alter table public.home_page_content enable row level security;
create policy "Home content readable" on public.home_page_content
  for select to anon, authenticated using (true);
create policy "Admins write home content" on public.home_page_content
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Reuse existing brand_versions table with scope='home' for snapshots
alter table public.brand_versions
  drop constraint if exists brand_versions_scope_check;
alter table public.brand_versions
  add constraint brand_versions_scope_check
  check (scope in ('global','tenant','department','home'));
```

Seed the single row with values matching today's hardcoded content so the first publish doesn't visually change anything.

## Server functions — `src/lib/home-content.functions.ts`

- `getHomeContent()` — public read of the live row (no auth).
- `getHomeContentAdmin()` — admin-only, returns live + draft.
- `saveHomeDraft({ content })` — admin-only, writes to `draft` jsonb.
- `publishHomeContent({ content, label? })` — admin-only: snapshots current live to `brand_versions(scope='home')`, copies new content to live columns, clears `draft`, sets `published_at`.
- `listHomeVersions()` — admin-only via existing `listBrandVersions` extended to accept `scope='home'`.

All admin functions reuse the `requireSupabaseAuth` + `ensureAdmin` pattern from `global-settings.functions.ts`. Zod validators reject overlong strings and enforce the section block discriminated union.

## Rendering — refactor `src/routes/index.tsx`

1. Convert `src/routes/index.tsx` into a thin route that calls `getHomeContent()` in the loader (public, no auth) and feeds it into a new `<HomePageView content={...} />` component.
2. New `src/components/home/HomePageView.tsx` renders:
   - `<HeroSection>` from `hero_*` fields, with the same module-aware secondary CTAs.
   - `sections.map(...)` dispatching to block renderers:
     `PortalCardsBlock`, `ExplainerCardsBlock`, `RichTextBlock`, `ImageBannerBlock`, `CtaBandBlock`.
   - `<HomeFooter>` from `footer_*` fields.
3. Each block respects the existing `useModules()` gating via an optional `requires_module` field per item.
4. Icon picker uses a small curated set (~15 lucide-react icons) referenced by string id so admins don't paste SVG paths. Color theme is a fixed enum (emerald, amber, indigo, pink, green, cyan, blue, navy) mapped to the existing class combos.
5. Keep current visual design exactly; existing class strings move into the block components.

## Admin editor — `src/routes/_authenticated/staff/admin.home.tsx`

Side-by-side layout matching the Branding editor.

- Left column: tabbed forms
  - **Hero** — text fields + secondary CTA list editor (add/remove/reorder, optional module gate).
  - **Sections** — sortable list of blocks. Each block has a type-specific editor:
    - Portal/Explainer card lists: drag-reorder, inline edit of title/description/steps, icon + color theme picker, module gate dropdown, add/duplicate/remove.
    - Rich text: markdown textarea with preview (use existing markdown renderer if available, otherwise plain text).
    - Image banner: URL field + asset uploader to the existing `branding` storage bucket (subfolder `home/`).
    - CTA band: headline, body, buttons list.
  - "Add section" menu inserts a new block of the chosen type.
  - **Footer** — three text fields.
  - **History** — list of `brand_versions` with `scope='home'`. "Load" button copies snapshot back into the form so the admin can review and publish to revert.
- Right column: sticky `<HomePageView>` fed by the in-memory form state so changes show instantly. Render inside a scaled iframe-like wrapper (`transform: scale(0.6)`) so the full layout fits.
- Footer action bar: **Save draft** and **Publish home page** buttons (mirror Branding mutations and toast handling).
- Drag-and-drop reordering uses `@dnd-kit/core` + `@dnd-kit/sortable` (already in the project per existing admin pages — verify; if not, install).

Link added to `src/routes/_authenticated/staff/admin.tsx` admin hub: **Edit home page →**.

## Versioning

- Reuse `brand_versions` with `scope='home'`, `scope_id=null`, full snapshot of the published row.
- `listBrandVersions` already accepts a scope arg; just allow `'home'` in the zod enum.
- Restore = load snapshot into form → user clicks Publish.

## Files

**Created**
- `supabase-migrations/035_home_page_content.sql`
- `src/lib/home-content.functions.ts`
- `src/components/home/HomePageView.tsx`
- `src/components/home/blocks/{PortalCardsBlock,ExplainerCardsBlock,RichTextBlock,ImageBannerBlock,CtaBandBlock,HeroSection,HomeFooter}.tsx`
- `src/components/home/icon-registry.ts` (string id → lucide icon)
- `src/routes/_authenticated/staff/admin.home.tsx`

**Edited**
- `src/routes/index.tsx` — fetch content and delegate rendering to `<HomePageView>`.
- `src/lib/global-settings.functions.ts` — extend `listBrandVersions` zod scope enum with `'home'`.
- `src/routes/_authenticated/staff/admin.tsx` — add "Edit home page →" link.

## Out of scope (call out for confirmation later)

- Multi-language / i18n editing.
- Per-department or per-tenant home page overrides (would extend the same table with a `scope_id`).
- Inline visual edit overlay on the live page — the side-by-side preview was chosen instead.
