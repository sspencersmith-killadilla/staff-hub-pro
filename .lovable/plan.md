## Goal
Replace the separate `/my-tickets` page with a unified `/wallet` that houses Event Tickets, Prize Tickets, and Raffle Entries in one place.

## UX

Single page at `/wallet` with three tabbed sections:

1. **Event Tickets** — current `my-tickets` content (QR for door check-in, seat info, session details)
2. **Prize Tickets** — quest reward tickets (QR for sponsor/City Hall redemption)
3. **Raffle Entries** — entries with draw date, prize, winner state

Header summary chip row: "3 event tickets · 2 prizes · 5 raffle entries" so users see everything at a glance.

Empty states per tab link to the relevant discovery surface (Events / Civic Quests).

## Routing

- Keep `/wallet` as the canonical URL.
- Turn `/my-tickets` into a redirect to `/wallet?tab=events` so old links, emails, and bookmarks still work.
- Update all in-app links currently pointing to `/my-tickets` (Hub, post-purchase confirmation, header menu) to `/wallet`.

## Header / Hub

- Header menu: keep single "My Wallet" link (already added). Remove any "My Tickets" entry that duplicates it.
- Hub dashboard: update the "My Tickets" card label/icon to "My Wallet" with a sub-count breakdown.

## Manual

Update the manual section so "My Tickets" is folded under "My Wallet" with three subsections matching the tabs.

## Files to touch

- `src/routes/_authenticated/wallet.tsx` — add Tabs, lift in event ticket card from my-tickets, default tab from `?tab=` search param
- `src/routes/_authenticated/my-tickets.tsx` — replace component with `<Navigate to="/wallet" search={{ tab: "events" }} replace />`
- `src/components/site-header.tsx` — ensure no duplicate "My Tickets" link
- `src/routes/_authenticated/hub.tsx` — rename card, point to `/wallet`
- Any post-purchase confirmation / email templates linking to `/my-tickets` → `/wallet`
- `src/routes/manual.tsx` — restructure tickets/wallet sections

## Out of scope
- No backend changes; both data sources already exist (`listMyTickets` from attendees + `listMyTickets` from quest-prizes + `listMyRaffles`). Will alias the quest one on import to avoid the name collision.
- No visual redesign of the existing ticket card — just relocated into a tab.
