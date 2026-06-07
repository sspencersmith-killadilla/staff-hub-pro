# WCAG 2.2 AA Audit & Remediation — Full Site

Two-phase delivery: a written audit report grouped by severity, then code fixes for every feasible Critical and Warning finding. Info-level "best-practice" items will be fixed when the change is mechanical and safe.

## What I'll audit (full site)

Every route in `src/routes/` — public pages (home, events, classes, venues, community, signup/login, survey responder, unsubscribe) plus the staff portal (`/staff/*`, `/staff/admin/*`) and authenticated user pages (hub, my-tickets, my-permits, etc.). Shared components in `src/components/` are reviewed once and the fixes propagate.

## What I'll check (WCAG 2.2 AA)

**Critical**
- Images missing `alt`, decorative images missing `alt=""`
- Icon-only buttons / links without accessible names (`aria-label` or visible text)
- Form inputs without a `<Label htmlFor>` or `aria-label`; required fields without `aria-required` / error association
- `onClick` on non-interactive elements (`div`/`span`) without role + keyboard handler
- `aria-hidden` on focusable ancestors; focus traps with no escape
- Color used as the only signal for status/errors

**Warning**
- Hardcoded color classes (`text-gray-*`, `text-white`, `bg-slate-*`) replaced with semantic tokens (`text-foreground`, `text-muted-foreground`, `bg-card`, …) — wholesale 640 hits to triage; fix every one in user-visible UI
- Multiple `<main>` per page — collapse to exactly one, lifted into the route layout
- `h-screen` → `h-dvh` on full-height layouts (mobile viewport bug)
- Heading order (no `h1`→`h3` jumps, single `h1` per route)
- Focus-visible rings present on every interactive element
- Tap targets ≥ 44×44 on mobile (icon buttons get `min-h-11 min-w-11`)
- `tabIndex` > 0 removed; `autoFocus` only inside dialogs
- WCAG 2.2 additions: focus appearance (2 px non-obscured outline), target size minimum, dragging alternatives, consistent help, redundant entry on multi-step forms
- Form errors announced via `role="alert"` / `aria-live`, error text linked with `aria-describedby`

**Info / best practice**
- Decorative icons get `aria-hidden="true"`
- Lists use `<ul>`/`<ol>`
- `lang="en"` on `<html>` (already present — verify)
- Skip-to-content link in root layout
- Dynamic toasts already use Sonner (live region) — confirm
- Redundant ARIA stripped from native elements

## Known hotspots from initial sweep

- Icon buttons missing `aria-label` in: `operating-hours-editor`, `staff/venues`, `staff/index`, `staff/admin.guidebook-canvas`, `staff/admin.social`, `staff/admin.home`, `staff/admin.guidebook-publisher`, `staff/admin.guidebook`, `staff/admin.permits`, `RichTextEditor` toolbar
- 640 hardcoded color-class usages across components/routes
- 58 `h-screen` usages → migrate to `h-dvh`
- Only 11 `aria-label` occurrences project-wide vs. many icon-only controls
- `tabIndex={0}` on a non-interactive element in `staff/admin.social`
- Root layout has no skip link

## Deliverables

1. **Audit report** posted in chat: counts by severity, per-area findings (Public, Auth, Staff, Admin, Components), top offending files.
2. **Code fixes** in passes:
   - Pass A — Critical: alt text, form labels, icon-button aria-labels, `<main>` deduplication, skip link, semantic landmarks.
   - Pass B — Warning: hardcoded color → semantic token sweep, `h-screen` → `h-dvh`, focus rings, target sizes, heading order, error association, `tabIndex` cleanup, WCAG 2.2 additions.
   - Pass C — Info: decorative icon `aria-hidden`, redundant ARIA removal, list semantics.
3. **Verification**: visual spot-check via preview at desktop + mobile viewports; lint check that build still passes.

## Out of scope

- Third-party embeds (maps, payment iframes) — flagged with mitigation notes, not rewritten.
- WCAG AAA criteria (7:1 contrast, sign-language alternatives).
- Server-rendered emails — fixed only if the templates produce visibly inaccessible markup.
- Manual screen-reader testing (NVDA/VoiceOver) — recommended as a follow-up; I'll set the markup up correctly but can't drive an AT.

## Technical notes

- Color sweep prefers token map: `text-gray-500/600` → `text-muted-foreground`; `text-gray-900/black` → `text-foreground`; `bg-white` → `bg-background`/`bg-card`; `bg-slate-*` chips → `bg-muted`/`bg-secondary`. Status colors (red/green/amber) kept where they encode meaning but paired with text/icon, not color alone.
- Skip link added once in `src/routes/__root.tsx` `RootComponent`, targeting `#main-content` set on each route's `<main>`.
- Icon button fix uses shadcn pattern: keep `size="icon"`, add `aria-label="…"`, mark inner Lucide icon `aria-hidden`.
- Toaster already mounted globally — no live-region changes needed.
