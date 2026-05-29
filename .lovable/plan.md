## Goals

Evolve the current 2-color global branding into a real white-label engine with three theming layers (tenant → global → department), a complete token system, a polished admin editor with live preview and accessibility checks, a proper logo/favicon asset pipeline, and a versioned publish workflow.

## 1. Data model changes

New migration `034_branding_engine.sql`.

`global_settings` — extend (additive, all nullable with sensible defaults):
- `accent_color`, `background_color`, `foreground_color`, `muted_color`, `destructive_color`
- `dark_primary_color`, `dark_background_color`, `dark_foreground_color`, `dark_accent_color`
- `radius` (text, e.g. `0.625rem`)
- `heading_font` (text), `body_font` (text, replaces `font_family` — keep `font_family` as a back-compat read)
- `logo_light_url`, `logo_dark_url`, `logo_icon_url`, `wordmark_url`, `og_image_url`
- `favicon_svg_url`, `favicon_32_url`, `favicon_180_url`, `favicon_512_url`, `manifest_url`
- `published_at` (timestamptz, nullable) — only published rows feed the public site
- `draft_of` (uuid, nullable, self-FK) — drafts attached to the live row

New tables:
- `brand_presets(id, name, tokens jsonb, logo_urls jsonb, created_by, created_at)` — named presets the admin can apply.
- `brand_versions(id, scope text check in ('tenant','global','department'), scope_id uuid null, snapshot jsonb, published_at, published_by, label text)` — every publish writes a snapshot for rollback.
- `tenants(id, slug unique, name, host text null, settings jsonb, created_at)` — new top layer for multi-tenant white-label. `host` lets a domain auto-resolve a tenant; `slug` is the fallback (e.g. `/t/cityname`).
- Department `brand_css` already exists; extend the typed columns alongside it so the editor can use the same widgets.

RLS: public `SELECT` on the live `global_settings` row, tenants, and presets. `INSERT/UPDATE/DELETE` gated by `has_role(auth.uid(),'admin')`. Versions: select for admins only.

Storage: keep the `branding` bucket; add per-tenant prefixes (`tenants/<id>/...`) so uploads don't collide.

## 2. Theming hierarchy (resolver)

A single `useResolvedBrand()` hook composes the layers in order of increasing priority — later layers override earlier ones per token:

```text
Tailwind defaults  →  tenant (resolved from host or /t/<slug>)  →  global  →  active department
```

Implementation: `applyBrandCss(brand, priority)` already supports priority; reserve:
- tenant: `-20`
- global: `-10`
- department layout: `0`
- per-route override: `10`

A `TenantBrandProvider` mounts above `GlobalBrandProvider` in `__root.tsx` and reads tenant by `window.location.host` (with `/t/<slug>` fallback for previews). On the server, head meta uses the same lookup so titles/OG render correctly without flicker.

## 3. Token system & color derivation

Centralize a `BrandTokens` type and a `deriveTokens(input)` utility that, given the admin's chosen colors, fills the rest:
- `--primary-foreground` auto-derived for AA contrast against `--primary` (pick white or near-black based on luminance).
- Hover/active shades via OKLCH lightness shifts (no new dependency — small util).
- Dark-mode variants auto-derived if the admin doesn't set explicit dark values.

This keeps the editor simple (admin only has to pick primary/secondary/accent), while shadcn's full token set stays consistent.

## 4. Admin editor: live preview + a11y

New layout for `/staff/admin/branding`:

```text
┌──────────────── editor (left, sticky) ────────────────┬──── live preview (right) ────┐
│ Tabs: Identity · Colors · Typography · Assets · Tenant│ Sample page renders inside an│
│ Color pickers (primary, secondary, accent, bg, fg)    │ iframe-like sandbox using a  │
│ Radius slider, dark-mode toggle                       │ scoped CSS-var container so  │
│ Font picker (see §5)                                  │ edits apply instantly without│
│ Logo/favicon uploaders (see §6)                       │ touching the real :root.     │
│ A11y panel: contrast ratios + WCAG AA/AAA badges      │ Header, hero, button, card,  │
│ Draft/Publish controls, version history list          │ form, alert, table examples. │
└────────────────────────────────────────────────────────┴───────────────────────────────┘
```

A11y checks (computed client-side, no new dep):
- `primary` vs `primary-foreground`
- `background` vs `foreground`
- `accent` vs `accent-foreground`
- `destructive` vs `destructive-foreground`
Show ratio + AA/AAA pass/fail per pair. Block "Publish" (with override) if any pair is below 3:1.

## 5. Curated font picker

`src/lib/branding/font-pairs.ts` — vetted list (reuse the curated pairs already documented in this project's design knowledge: `space-grotesk-dm-sans`, `syne-plus-jakarta`, `outfit-figtree`, `sora-manrope`, `instrument-serif-work-sans`, `dm-serif-display-fira-sans`, `cormorant-karla`, `libre-baskerville-ibm-plex`, `lora-nunito-sans`, `bebas-neue-barlow`, `archivo-black-hind`, `abril-fatface-cabin`, `jetbrains-mono-work-sans`, `space-mono-rubik`).

UI: a `<RadioGroup>` of cards. Each card renders its heading font name in itself and a paragraph in the body font. Selecting a pair stores `heading_font` + `body_font`. The provider injects a Google Fonts `<link>` for both, plus CSS variables `--font-heading` and `--font-sans`.

## 6. Logo & favicon pipeline

Upload widgets accept PNG/SVG/WebP. For the favicon, generate the multi-size set in the browser via a `<canvas>` resize (16, 32, 48, 180, 192, 512), upload each to storage, and persist all URLs.

Auto-build `manifest.webmanifest` content from the admin inputs (name, short_name, theme_color, icons[]) and either store it as JSON in `global_settings.manifest_url` (uploaded as a file) or serve it from `src/routes/api/public/manifest.webmanifest.ts` reading from the DB.

`<head>` adds:
- `<link rel="icon" type="image/svg+xml" href={favicon_svg_url}>`
- `<link rel="icon" sizes="32x32" href={favicon_32_url}>`
- `<link rel="apple-touch-icon" sizes="180x180" href={favicon_180_url}>`
- `<link rel="manifest" href="/manifest.webmanifest">`
- `<meta name="theme-color" content={primary_color}>`
- `og:image` from `og_image_url` (a real share image, distinct from the wordmark).

`SiteHeader` picks logo_dark_url when the active department/tenant theme is dark, falling back to `logo_light_url`.

## 7. Presets, versioning, publish workflow

Editor changes are always written to a **draft** row tied to the live row. The live row only changes on **Publish**:

- "Save draft" → upserts the draft, no public effect.
- "Publish" → copies draft tokens onto the live row, sets `published_at`, writes a `brand_versions` snapshot.
- "Version history" panel lists previous snapshots with `Restore` (creates a new draft from that snapshot) and `Revert` (publishes that snapshot directly).
- "Save as preset" → captures current draft tokens into `brand_presets`. "Apply preset" loads tokens into the draft.

## 8. Tenant layer

- `tenants` table + a `useTenant()` resolver: by `host` first, then `/t/<slug>` prefix in the URL, then null.
- `TenantBrandProvider` injects tenant tokens at priority `-20`.
- Admin gets a new `/staff/admin/tenants` page (list + create + per-tenant branding editor that reuses the same widgets, scoped to the tenant row).
- Document title becomes `${activeDepartment?.name ?? tenant?.name ?? global.city_name} — …`.

## 9. Backward compatibility

- `font_family` stays readable; the resolver returns `body_font ?? font_family ?? 'Inter'`.
- Existing single-row `global_settings` is migrated in place; new columns are nullable so nothing breaks.
- Existing department `brand_css` JSON keeps overriding global at priority `0`.

## Out of scope (call out for later)

- Theme A/B testing, scheduled brand changes, brand approval roles, exporting tokens as a downloadable `tokens.json` / Style Dictionary bundle. Easy to add later on top of `brand_versions`.

## Technical notes

- New files: `src/contexts/tenant-brand-context.tsx`, `src/lib/branding/{tokens.ts,derive.ts,contrast.ts,font-pairs.ts}.ts`, `src/components/admin/branding/{LivePreview,ColorEditor,FontPicker,LogoUploader,FaviconPipeline,VersionHistory,PresetPicker,ContrastReport}.tsx`, `src/routes/_authenticated/staff/admin.tenants.tsx`, `src/routes/api/public/manifest.webmanifest.ts`.
- Updated files: `supabase-migrations/034_branding_engine.sql`, `src/lib/global-settings.functions.ts` (add draft/publish/version/preset RPCs), `src/contexts/global-brand-context.tsx` (consume token system), `src/components/theme-provider.tsx` (reserve priority slots), `src/components/site-header.tsx` (light/dark logo), `src/routes/__root.tsx` (mount TenantBrandProvider, add favicon/manifest/theme-color/og links via head()), `src/routes/_authenticated/staff/admin.branding.tsx` (full rewrite with tabs + preview).
- No new heavyweight deps required. Color math via tiny inline OKLCH helpers; favicon generation via canvas; font previews via Google Fonts links.
