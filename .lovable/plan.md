
# Rewrite REPRODUCTION.md and README.md for non-technical, zero-cost self-hosting

## Goals (from your message)
- **Zero Lovable dependency.** Nothing in the instructions should require Lovable, Lovable Cloud, or the Lovable AI Gateway.
- **Zero cost path.** Default route should cost $0/month for a small city or nonprofit (free tiers only).
- **Soup to nuts.** Start at "I have nothing installed" and end at "my site is live on my own domain."
- **Beginner-friendly.** Written so a non-technical staffer can follow along — every command, every click, every screen.
- **Keep USAePay** instructions intact (the working integration in `src/lib/payments.functions.ts` + `src/lib/usaepay.server.ts`).
- **Document multiple payment options** so cities can pick: USAePay (wired up), Stripe, PayPal, Square, or "no payments at all" (free events only).

---

## New REPRODUCTION.md — structure

Plain English, numbered steps, screenshots/links where helpful, "what this does / why you need it" callouts before each section.

### Part 1 — What you're building (1 page)
- One paragraph: what the platform does (events, tickets, rooms, vendors, surveys, comms).
- Cost table: **free tier ($0/mo)** vs **paid tier (~$25/mo at scale)**.
- Time estimate: ~2 hours for a first-timer.

### Part 2 — Install the free tools on your computer (Mac + Windows)
Click-by-click, with download links:
1. Install **Git** (link + installer walk-through).
2. Install **Node.js 20 LTS** (link + verify with `node -v`).
3. Install **Bun** (one-line installer for Mac/Linux, PowerShell line for Windows).
4. Install **VS Code** (optional, for editing config files).
5. Install the **Wrangler CLI** (`npm i -g wrangler`) — explained as "the tool that uploads the site."

### Part 3 — Get the code
1. Fork the GitHub repo (screenshot of the Fork button).
2. `git clone` your fork.
3. `bun install` — explained as "downloads all the building blocks."

### Part 4 — Create your free database (Supabase — free tier, no card)
1. Sign up at supabase.com (free, no credit card).
2. Create a project, save the database password.
3. Copy 3 values from **Settings → API**: Project URL, publishable key, service_role key.
4. Edit `src/integrations/supabase/config.ts` — paste URL + publishable key (the only file edit a non-coder has to make).
5. Open **SQL Editor** → paste each migration in order (`001` through `038`). Provide a copy-paste loop using the Supabase CLI as the "advanced" alternative.
6. Turn on `pg_cron` and `pg_net` extensions (one click each in Database → Extensions).
7. Create the first admin user: sign up on the local site, then run the 2-line SQL snippet to grant the `admin` role in `user_roles`.

### Part 5 — Run it on your laptop first
- `bun dev` → open http://localhost:8080.
- Walk through: sign up, promote yourself, open `/staff`, create a department.
- Troubleshooting box for the 3 most common errors (port in use, missing env var, RLS denial).

### Part 6 — Pick a payment option (or skip)
A clear decision tree, each with its own sub-section:

**Option A — No payments (free events only).** Skip this part entirely. The platform works.

**Option B — USAePay** *(already wired up, preferred for U.S. municipalities — no per-transaction Stripe-style fees, merchant-account-based).*
1. Apply for a USAePay merchant account (link).
2. Get `USAEPAY_API_KEY` + `USAEPAY_API_PIN` from the USAePay console.
3. Add them as secrets (see Part 8). Set `USAEPAY_MODE=sandbox` to test, then flip to `live`.
4. Test card numbers + how to verify a sandbox transaction.

**Option C — Stripe** (easiest signup, 2.9% + 30¢).
1. Create a Stripe account.
2. Grab the secret key + webhook signing secret.
3. Swap the helper: a 30-line drop-in `src/lib/stripe.server.ts` snippet + which lines in `payments.functions.ts` to change. Include the snippet in the doc so they can copy-paste.

**Option D — PayPal Checkout / Braintree.** Sign-up link + REST credential location + the same swap pattern with a code snippet.

**Option E — Square.** Same pattern with a code snippet.

Each option ends with: "Now skip ahead to Part 7."

### Part 7 — Optional add-on services (each with a "skip if you don't need it" banner)
- **Email (Resend)** — free tier 3,000/mo. How to verify a domain, set `RESEND_API_KEY` + `RESEND_FROM`, then schedule the `pg_cron` job that hits `/api/public/dispatch-due`. SQL snippet included.
- **Auto-generated images** — three drop-in options (OpenAI, Google Gemini, Stability) with the exact function signature `src/lib/auto-image.server.ts` must satisfy. Also: "leave this off — the platform still works."
- **Google sign-in** — Google Cloud Console click-through, where to paste the OAuth client id/secret in Supabase.
- **Social Command Center** — Meta + LinkedIn developer app walk-through, callback URLs to register.
- **Custom domain** — pointing a domain at Cloudflare.

### Part 8 — Put it on the internet (free Cloudflare Workers)
1. Create a Cloudflare account (free, no card for Workers free tier — 100k requests/day).
2. `wrangler login` (browser flow, one click).
3. `wrangler secret put` for each secret — full checklist of names with what each one is for.
4. `bun run build` then `wrangler deploy`. Result: a `*.workers.dev` URL that anyone can visit.
5. Optional: connect a custom domain via Cloudflare DNS.
6. **Alternative free hosts** (one paragraph each, links to their adapter docs): Vercel, Netlify, Render, Fly.io.

### Part 9 — Verify everything works (smoke test checklist)
Numbered list of URLs to click after deploy: `/`, `/events`, `/manual`, `/staff`, `/staff/admin/permissions`, `/staff/communications`, `/staff/surveys`, `/survey/<id>`. What each should look like (1-line description).

### Part 10 — Day-to-day operations
- How to apply a new migration when the repo updates.
- How to back up the database (Supabase free tier has 7-day PITR).
- How to invite more admins.
- Where logs live (Wrangler tail, Supabase logs).
- Who to ask for help (GitHub Issues link, Supabase Discord, Cloudflare community).

### Part 11 — Troubleshooting
Expanded from the current short list: ~12 common error messages with the exact fix. Each entry: symptom (verbatim error text) → cause → fix.

### Appendix A — Full environment variable reference
Single table: name, where it goes (.dev.vars / wrangler secret / .env), required-or-optional, where to get it.

### Appendix B — Cost calculator
Rows for each service at three scale tiers: 100 users, 1k users, 10k users. Shows the platform stays free at small-city scale.

### Appendix C — Glossary
Plain-English definitions: RLS, env var, secret, migration, Worker, SSR, OAuth, webhook, cron — so non-technical readers aren't lost.

---

## README.md — rewrite to match

Keep the project overview but **remove every Lovable URL and Lovable-Cloud reference**. New shape:
1. One-paragraph what-it-is.
2. Feature list by audience (community / staff / admin) — keep current content.
3. Tech stack table — remove "Lovable AI Gateway"; replace with "OpenAI / Gemini / Stability (pluggable)".
4. **Quick start (5 lines)** for developers who already have Node/Bun.
5. **Non-technical setup** → link to `REPRODUCTION.md` as the canonical guide.
6. Payment options summary table (USAePay / Stripe / PayPal / Square / none) — one row each, link to the relevant REPRODUCTION.md section.
7. Repo layout (keep).
8. Server-side architecture rules (keep).
9. Module breakdown (keep).
10. Links section — drop Lovable preview/published URLs; keep `/manual`, `REPRODUCTION.md`.

---

## Files changed
- `REPRODUCTION.md` — full rewrite (~3-4× current length to cover beginner steps + all payment options).
- `README.md` — rewrite the Lovable-specific sections and add the payment-options table.

## Not in scope (will confirm before doing)
- Regenerating `public/ReproductionInstruction.pdf` and `public/manual.pdf` from the new markdown.
- Actually wiring Stripe/PayPal/Square into the codebase (the docs include drop-in snippets, but no new `.functions.ts` files are added unless you ask).

Let me know if you want me to (a) also regenerate the PDFs, and (b) actually scaffold the Stripe/PayPal/Square server helpers as optional files in the repo, or just leave them as copy-paste snippets in the doc.
