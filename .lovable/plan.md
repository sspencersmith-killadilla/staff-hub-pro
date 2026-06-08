## Why iOS shows a blue "O" tile

iOS Safari grabs the home-screen icon at the exact moment you tap **Add to Home Screen** — and it only looks at `<link rel="apple-touch-icon">` in the **initial HTML** that the server sent. It does **not** wait for React to run, and it does **not** read the icons listed in `manifest.webmanifest` on iOS.

Right now our apple-touch-icon link is injected client-side by `GlobalBrandProvider` after React boots. By the time it lands in the DOM, Safari has already decided there is no icon — so it falls back to its auto-generated tile: brand-color background + first letter of the page title (the "O" you're seeing is from "Oneonta" / your city name).

The manifest icons we serve are correct; iOS just ignores them for home-screen installs.

## Fix

Put the apple-touch-icon (and the manifest link) into the server-rendered HTML so they're present on the very first byte Safari sees.

### 1. Add a stable icon endpoint

Create `src/routes/api/public/apple-touch-icon[.]png.ts` — a `GET` route that:

- Reads `favicon_180_url` (falling back to `favicon_512_url`, then `favicon_url`) from `global_settings` using `supabaseAdmin`.
- Returns a `302` redirect to that URL.
- Sends `Cache-Control: public, max-age=300` so iOS refetches reasonably often but doesn't hammer the DB.
- If no icon is configured, redirects to a sensible default PNG (or returns 404 so iOS uses its fallback only when nothing is set).

This gives iOS a single, stable, server-resolved URL (`/apple-touch-icon.png`) regardless of which CDN URL the admin uploaded.

### 2. Reference it from `__root.tsx` `head()`

In `src/routes/__root.tsx`, extend the existing `head()` return with `links` entries that ship in the initial HTML:

- `{ rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" }`
- `{ rel: "apple-touch-icon-precomposed", href: "/apple-touch-icon.png" }` (older iOS)
- `{ rel: "manifest", href: "/api/public/manifest.webmanifest" }` (if not already present in HTML — currently only injected at runtime)
- `{ rel: "icon", href: "/favicon.ico" }` as a baseline so first paint isn't blank

Keep the existing client-side `GlobalBrandProvider` logic — it stays useful for live updates after the admin changes branding without a reload.

### 3. (Optional polish) Apple meta tags

While we're in the root head, add these so the installed app feels right on iOS:

- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
- `<meta name="apple-mobile-web-app-title" content="{city_name}">` — note this needs to be in initial HTML too if we want the home-screen label to match the brand. Easiest: hardcode "Total Event System" or read from an env var; making it fully dynamic would need SSR loader work in `__root.tsx`.

## What the user needs to do after this ships

iOS aggressively caches the home-screen icon. Existing installs that show the blue "O" must be **removed from the home screen and re-added** to pick up the new icon. New installs will work immediately.

## Technical notes

- Endpoint must live under `/api/public/*` so it's reachable without auth on the published site.
- Use `supabaseAdmin` (service role) — no user context is available for a raw asset fetch.
- iOS ignores SVG for `apple-touch-icon`; the 180×180 PNG we already generate in the favicon pipeline is the right source.
- Do not add a service worker as part of this fix — manifest-only is enough for home-screen installability.
