import type { HomeContent } from "./home-content.functions";

// Fallback used when the DB row hasn't been seeded yet (e.g. local dev before
// migration runs). Mirrors the seed in 035_home_page_content.sql.
export const DEFAULT_HOME_CONTENT: HomeContent = {
  id: "default",
  hero_badge: "Proof of Concept Demo",
  hero_title: "Community Event & Partnership Portal",
  hero_subtitle:
    "Your central hub to discover local events, book municipal spaces, and partner with the city.",
  hero_authed_message:
    "One account, every program — apply as a musician, register a community org, book a room, and more.",
  hero_signup_cta_label: "Create one account for everything",
  hero_login_cta_label: "Already have an account? Log in",
  hero_primary_cta_label: null,
  hero_primary_cta_href: null,
  hero_secondary_ctas: [
    { label: "Upcoming Events", href: "/events", style: "primary" },
    { label: "Report an Issue (311)", href: "/report" },
    { label: "Civic Quests", href: "/explore", requires_module: "civic_quests" },
    { label: "Businesses Hub", href: "/vendor", requires_module: "vendors_sponsors" },
    { label: "Organizations Portal", href: "/community", requires_module: "community_orgs" },
    { label: "StreetBeats Portal", href: "/streetbeats", requires_module: "streetbeats" },
    { label: "Room Reservations", href: "/rooms", requires_module: "room_reservations" },
  ],
  sections: [
    {
      type: "portal_cards",
      id: "portals",
      items: [
        { id: "members", title: "Community Members", description: "Browse the public directory to find upcoming literary series, workshops, and symposiums.", link_to: "/events", link_text: "Event Directory →", icon: "ticket", color_theme: "emerald" },
        { id: "report311", title: "Report a Non-Emergency Issue", description: "See a pothole, graffiti, or park maintenance problem? Submit a 311 report with a photo and location, then track it from received to resolved.", link_to: "/report", link_text: "Report an Issue →", icon: "pin", color_theme: "amber" },
        { id: "quests", title: "Civic Quests", description: "Explore the city through guided quests — check in at landmarks, earn badges, and climb the public leaderboard.", link_to: "/explore", link_text: "Start Exploring →", icon: "award", color_theme: "indigo", requires_module: "civic_quests" },
        { id: "staff", title: "City Staff", description: "Access the Command Center to manage rosters, review applications, and track schedules.", link_to: "/staff", link_text: "Staff Ops →", icon: "clipboard", color_theme: "blue" },
      ],
    },
  ],

  footer_tagline: "Proof of Concept Demonstration",
  footer_body:
    "This platform is a functional prototype. No real transactions are processed, and all data is for demonstration purposes only.",
  footer_copyright: "Municipal Solutions Platform",
  draft: null,
  published_at: null,
  updated_at: new Date().toISOString(),
};
