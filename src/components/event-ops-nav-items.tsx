import {
  Calendar,
  Building2,
  Users,
  Store,
  Sparkles,
  Music,
  CalendarDays,
  BedDouble,
  Settings,
  HeartHandshake,
  GraduationCap,
  Share2,
  Mail,
  ClipboardList,
  AlertTriangle,
} from "lucide-react";
import { useDepartment } from "@/contexts/department-context";
import type { ModuleKey } from "@/lib/platform-modules.functions";
import type { PermissionKey } from "@/lib/staff-permissions";

export type EventOpsNavItem = {
  title: string;
  url: string;
  icon: typeof Calendar;
  exact?: boolean;
  module?: ModuleKey;
  permission?: PermissionKey;
};

export const eventOpsNavItems: EventOpsNavItem[] = [
  { title: "Events", url: "/staff", icon: Calendar, exact: true, module: "events", permission: "page.events" },
  { title: "Venues & Stages", url: "/staff/venues", icon: Building2, module: "venues", permission: "page.venues" },
  { title: "Box Office", url: "/staff/attendees", icon: Users, module: "box_office", permission: "page.box_office" },
  { title: "Vendors", url: "/staff/vendors", icon: Store, module: "vendors_sponsors", permission: "page.vendors" },
  { title: "Sponsors", url: "/staff/sponsors", icon: Sparkles, module: "vendors_sponsors", permission: "page.sponsors" },
  { title: "Community Music", url: "/staff/community-music", icon: Music, module: "streetbeats", permission: "page.community_music" },
  { title: "Community Orgs", url: "/staff/community-organizations", icon: HeartHandshake, module: "community_orgs", permission: "page.community_orgs" },
  { title: "Community Events", url: "/staff/community-events", icon: CalendarDays, module: "community_orgs", permission: "page.community_events" },
  { title: "Room Reservations", url: "/staff/room-reservations", icon: BedDouble, module: "room_reservations", permission: "page.room_reservations" },
  { title: "Classes", url: "/staff/classes", icon: GraduationCap, module: "classes", permission: "page.classes" },
  { title: "Social Command", url: "/staff/admin/social", icon: Share2, module: "social_command", permission: "page.social_command" },
  { title: "Communications", url: "/staff/communications", icon: Mail, permission: "page.communications" },
  { title: "Surveys", url: "/staff/surveys", icon: ClipboardList, permission: "page.surveys" },
  { title: "311 Dispatch", url: "/staff/dispatch", icon: AlertTriangle },
  { title: "311 Assets", url: "/staff/assets", icon: AlertTriangle },
  { title: "Platform Settings", url: "/staff/settings", icon: Settings, permission: "page.settings" },
];

export function ActiveDepartmentBadge() {
  const { activeDepartment, memberships } = useDepartment();
  if (!activeDepartment) return null;
  return (
    <div className="mt-2 text-[10px] uppercase tracking-widest text-white/60">
      <span className="text-white/40">Dept ·</span>{" "}
      <span className="text-white font-bold">{activeDepartment.name}</span>
      {memberships.length > 1 && (
        <span className="ml-1 text-white/40">({memberships.length})</span>
      )}
    </div>
  );
}
