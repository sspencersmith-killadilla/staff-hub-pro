# Three Accessibility Follow-Ups

## 1. Screen-reader walkthrough — top 3 flows

I cannot literally drive NVDA or VoiceOver from this environment. What I *can* do is a **structural screen-reader simulation** for each flow: walk the rendered DOM the way a screen reader would announce it (landmarks → headings → labels → focusable order → live regions), flag every mismatch with WCAG references and a recommended fix, then apply the fixes.

Flows:
- **Ticket purchase** — `/events` → `/events/$id` → ticket selection → checkout → confirmation.
- **Survey response** — `/survey/$id` (load, answer, submit, success/error state).
- **Vendor application** — `/vendor` (multi-step form, photo upload, review, submit).

What I'll check on each step:
- Page has exactly one `<h1>`, sensible heading hierarchy.
- Single `<main id="main-content">` reachable from the global skip link.
- Form controls labeled (`<Label htmlFor>`, `aria-label`, or wrapping label) and required fields marked.
- Validation errors associated via `aria-describedby` and announced via `role="alert"` / `aria-live="assertive"`.
- Async state changes (loading, success toast, redirect) announced.
- Focus order matches visual order; focus moves to the right place after step transitions and modal opens.
- Buttons have visible text or `aria-label`; disabled state isn't communicated by color alone.
- Image alts: descriptive for content, empty for decorative.

Deliverable: a per-flow report (step-by-step transcript with issues), then a fix pass.

Honesty note: structural simulation catches the vast majority of SR issues, but doesn't replace a live AT pass. I'll recommend the user (or a tester) run NVDA/VoiceOver against the same flows once fixes land.

## 2. Vendor portal color-contrast audit

`src/routes/vendor.tsx` uses a fixed gov.uk-style palette outside the theme system. I'll compute WCAG 2.2 contrast ratios for every foreground/background combination actually used in the file, against:
- **Normal text** — needs ≥ 4.5:1 (AA) / ≥ 7:1 (AAA).
- **Large text** (≥18pt or 14pt bold) — needs ≥ 3:1 (AA) / ≥ 4.5:1 (AAA).
- **Non-text UI** (borders, focus rings, icons conveying info) — needs ≥ 3:1.

Palette in use:
```
#005ea2  #00a91c  #112e51  #1a4480  #1b1b1b
#825e0e  #a57914  #aebecf  #bbf7d0  #e4f2e7
#e8c872  #f0f6ff  #f4f6f9  #fde047  #fde68a
#fef3c7  #fff3d4  #fffcf2  #fffdf5
```

Process:
1. Grep every `text-[#…]` / `bg-[#…]` pair in `vendor.tsx`; collect the actual combinations used.
2. Write a small Node script to compute the WCAG relative-luminance contrast ratio for each pair.
3. Produce a table: pair → ratio → AA normal / AA large / non-text → pass or fail.
4. For each failure, swap to the nearest brand-compatible color that passes (usually darker text or darker fill). Example expected issue: `#825e0e` on `#fff3d4` body text is borderline; `#aebecf` borders on `#f4f6f9` likely under 3:1.
5. Apply fixes in `vendor.tsx`. Other files in the codebase already use semantic tokens and were covered in the previous audit, so scope stays in this one file.

Deliverable: contrast report posted in chat + fixes.

## 3. Automated `vitest-axe` per-route regression coverage

The project has no test setup today. I'll bootstrap one focused on accessibility:

**Setup**
- Add devDependencies: `vitest`, `@vitest/ui`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `vitest-axe`, `axe-core`.
- Add `vitest.config.ts` with `environment: "jsdom"` and a setup file that:
  - Mocks `@tanstack/react-router` `Link` / `useNavigate` / `Outlet`.
  - Mocks Supabase clients (`@/integrations/supabase/client`, server functions) so route components don't try to fetch.
  - Provides a `QueryClient` wrapper.
- Add `bun test:a11y` script.

**Per-route tests**
- Generate one test per route file in `src/__tests__/a11y/<route>.test.tsx`.
- Each test:
  1. Imports the route's component (not the route object).
  2. Renders it inside the wrapper with stub loader data (smallest shape that lets it render).
  3. Calls `axe(container)` and asserts no violations.
- Coverage: every page in `src/routes/`, both public and authenticated. Routes that hard-require auth render the gated layout in a "signed-in" mock state.

**Limits I'll be upfront about**
- axe catches roughly 30–40% of real accessibility issues — it's a regression net, not a guarantee of compliance.
- Routes with complex data shapes will get minimal-data smoke tests; deep state-based variants (filled forms, error states) aren't auto-covered.
- Test setup adds ~6 dev dependencies and a `vitest.config.ts`. No prod bundle impact.

## Suggested order

1. Vendor contrast audit (smallest, contained — 1 file).
2. vitest-axe setup + initial test sweep (catches structural issues across all routes immediately).
3. Manual SR walkthrough on the 3 flows (uses the same setup; deeper fixes informed by what axe missed).

I'll keep going through all three unless you want to skip one.
