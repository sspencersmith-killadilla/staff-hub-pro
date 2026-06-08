# Plan (revised): Operator Info Sheets + Companion Video

Good catch — adding **311 Reports & Dispatch** and the **Homepage Content Editor** to the lineup. Both are first-class operator surfaces (`/staff/dispatch`, `/staff/admin/issue-categories`, `/staff/admin/home`) and deserve their own pages.

## Updated module list (14 sheets, 1 page each)

1. Events & Box Office
2. Venues
3. Room Reservations
4. Classes
5. Vendors & Sponsors
6. Community Organizations
7. StreetBeats (busker permits)
8. Social Command
9. Guidebook
10. Civic Quests & Discovery
11. Prizes & Raffles
12. My Wallet (Events / Prizes / Raffles)
13. **311 Reports & Dispatch** — citizen issue intake, categories, dispatch queue, status updates
14. **Homepage Content Editor** — tenant-overridable home page sections, hero, featured cards, prominence toggles

Note: items 13–14 are operator tools that aren't in `use-modules.ts` toggle registry; their sheets will note "Always-on / not module-toggleable" in the toggle slot.

## Everything else unchanged

- Same 1-page template (purpose, what it does, key routes, workflow, roles, integrations, what it replaces, toggle key).
- PDF generated with `reportlab` + Inter, matching brochure styling. Output: `/mnt/documents/operator-info-sheets.pdf` (cover + index + 14 module pages = 16 pages).
- Companion Remotion video extended to 14 module beats (~4s each) + intro/outro → ~65s total. Output: `/mnt/documents/total-event-system-walkthrough.mp4`.
- Full visual QA on every PDF page and key video frames before delivering.
- No source files in the project repo are modified — both are artifacts only.

Ready to switch to build mode?
