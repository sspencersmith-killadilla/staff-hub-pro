import type { PermissionKey } from "@/lib/staff-permissions";

export type RolePreset = { key: string; label: string; description: string; permissions: PermissionKey[] };

/** One-click starting bundles for common city job roles. Admins can still fine-tune after applying. */
export const ROLE_PRESETS: RolePreset[] = [
  {
    key: "front_desk",
    label: "Front desk clerk",
    description: "Room bookings, classes and box office check-in.",
    permissions: ["page.room_reservations", "page.classes", "page.box_office", "event.door"],
  },
  {
    key: "events_producer",
    label: "Events producer",
    description: "Runs events end to end: venues, vendors, sponsors, talent.",
    permissions: [
      "page.events", "page.venues", "page.box_office", "page.vendors", "page.sponsors", "page.community_music",
      "event.reports", "event.door", "event.tickets", "event.gigs", "event.floorplan", "event.marketing",
      "event.commercial", "event.vendors", "event.sponsors", "event.volunteers", "event.talent",
    ],
  },
  {
    key: "community_liaison",
    label: "Community liaison",
    description: "Community groups, their events, surveys and quests reporting.",
    permissions: ["page.community_orgs", "page.community_events", "page.surveys", "page.quests_report"],
  },
  {
    key: "communications",
    label: "Communications officer",
    description: "Email campaigns, social media and surveys.",
    permissions: ["page.communications", "page.social_command", "page.surveys", "event.marketing"],
  },
];
