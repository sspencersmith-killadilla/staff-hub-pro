# Making TESS deployment-ready for municipal governments

TESS already covers a lot: events, permits, room reservations, 311/dispatch, surveys, communications, social, quests/raffles, assets, vendors, sponsors, branding/tenants, and integrations. The gap is less "more features" and more "trust, simplicity, and fit with how cities actually buy and run software." Recommendations below, grouped by priority.

## 1. Trust and compliance (blockers for most city procurement)
- Accessibility: audit every public page to WCAG 2.1 AA (now legally required for US local governments under the 2024 ADA Title II rule, deadlines 2026-2027). Keyboard navigation, contrast, screen-reader labels, captions on media.
- Multilingual: machine translation (AI) of the interface and content into common local languages, with a staff "review/approve" option for official notices, plus residents writing 311 requests in their own language and staff seeing an English translation.
- Records and retention: a public-records export (per ticket, per event, per communication), retention rules, and an audit log of who changed what.
- Security posture page: a simple trust page (data location, backups, access controls, incident contact) cities can attach to procurement questionnaires.
- Staff sign-in through the city's existing accounts (Microsoft/Google single sign-on) and required two-step verification for admins.

## 2. Simplify the product (reduce training cost)
- Role-based home screens: a clerk, a parks coordinator, and a dispatcher each see only their tools. Today the staff menu exposes ~40 areas.
- Feature switches per city: turn modules (raffles, quests, music, sponsors, guidebook) on or off so a small town isn't overwhelmed.
- Guided setup wizard for a new city: branding, departments, venues, staff invites, first event — in under an hour.
- Consolidate overlapping areas: community events vs. staff events, two integrations pages, social vs. social-integrations.
- Built-in help: short tips and "what is this?" text on each page, written for non-technical staff.

## 3. Resident experience
- Mobile-first public pages and an installable app (home-screen icon, offline viewing of guidebooks/maps).
- One resident account across events, permits, reservations, 311, and surveys, with a "My City" page showing everything they've done.
- Text message notifications (not just email) for 311 updates, permit approvals, and event changes; many residents don't check email.
- Online payments for permits, reservations, and tickets with refunds and receipts for city finance.

## 4. Reliability of integrations (lessons from WorkPlanOS)
- One shared "connections" framework: every outside system gets the same setup screen, test button, activity log, automatic retries, and plain-language error messages.
- Health dashboard: a single page showing which connections, emails, and scheduled jobs are working, with alerts when something fails.
- Standard exports/feeds cities ask for: calendar feeds (iCal), open data CSV, and connections to common tools (Microsoft 365 calendars, GIS/Esri maps for 311 and assets, accounting exports).

## 5. Operations for the vendor (you)
- Clean separation of each city's data, with a per-city staging copy for training.
- Automated tests on the rules that matter (permissions, pricing, permit fees, 311 assignment) so changes stop breaking things that worked.
- Consolidate the 63 database changes into a clean, verified baseline so new cities can be set up without the migration errors we hit.
- Usage reporting for city leadership: tickets resolved, response times, attendance, revenue — ready for council meetings.

## Suggested order
1. Accessibility audit + role-based menus + feature switches (biggest adoption impact, low risk).
2. Multilingual + text notifications.
3. Integration health dashboard + shared connection framework.
4. Payments, SSO, records export.
5. Setup wizard and leadership reporting.

## Technical notes
- Translation via Lovable AI with cached translations per language stored in the database; staff-reviewed overrides take precedence.
- Feature switches as a per-tenant settings table read in the root layout to filter navigation and guard routes.
- Health dashboard reads integration_dispatches, email logs, and cron run records.
- Migration baseline: generate a single schema snapshot for fresh installs; keep incremental migrations for existing ones.

Approve to start with step 1, or tell me which area to prioritize.
