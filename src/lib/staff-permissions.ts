import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const assertStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["staff", "admin"])
      .maybeSingle();

    if (error || !data) {
      throw new Error("Unauthorized: Staff access required");
    }
    return { userId };
  });

export const assertPermission = (permission: PermissionKey) => 
  createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .handler(async ({ context }) => {
      const { supabase, userId } = context;
      
      const { data: isAdmin } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (isAdmin) return;

      const { data } = await supabase
        .from("staff_permissions")
        .select("permission")
        .eq("user_id", userId)
        .eq("permission", permission)
        .maybeSingle();

      if (!data) {
        throw new Error(`Forbidden: Missing permission ${permission}`);
      }
    });

export const PAGE_PERMISSIONS = [
  { key: "page.events", label: "Events list" },
  { key: "page.venues", label: "Venues & Stages" },
  { key: "page.box_office", label: "Box Office" },
  { key: "page.vendors", label: "Vendors" },
  { key: "page.sponsors", label: "Sponsors" },
  { key: "page.community_music", label: "Community Music" },
  { key: "page.community_orgs", label: "Community Orgs" },
  { key: "page.community_events", label: "Community Events" },
  { key: "page.room_reservations", label: "Room Reservations" },
  { key: "page.settings", label: "Platform Settings" },
] as const;

export const EVENT_PERMISSIONS = [
  { key: "event.reports", label: "Reports" },
  { key: "event.door", label: "Door / Scanner" },
  { key: "event.tickets", label: "Ticketing" },
  { key: "event.gigs", label: "Gigs" },
  { key: "event.floorplan", label: "Floorplan" },
  { key: "event.marketing", label: "Marketing" },
  { key: "event.commercial", label: "Commercial" },
  { key: "event.vendors", label: "Vendors" },
  { key: "event.sponsors", label: "Sponsors" },
  { key: "event.volunteers", label: "Volunteers" },
  { key: "event.talent", label: "Talent" },
] as const;

export type PermissionKey =
  | (typeof PAGE_PERMISSIONS)[number]["key"]
  | (typeof EVENT_PERMISSIONS)[number]["key"];

export const ALL_PERMISSIONS: PermissionKey[] = [
  ...PAGE_PERMISSIONS.map((p) => p.key),
  ...EVENT_PERMISSIONS.map((p) => p.key),
];

export type PermissionsSnapshot = {
  isAdmin: boolean;
  global: PermissionKey[];
  perEvent: Record<string, { grant: PermissionKey[]; revoke: PermissionKey[] }>;
};

export function canPermission(
  snap: PermissionsSnapshot | null | undefined,
  permission: PermissionKey,
  eventId?: string,
): boolean {
  if (!snap) return false;
  if (snap.isAdmin) return true;
  if (eventId) {
    const ev = snap.perEvent[eventId];
    if (ev) {
      if (ev.revoke.includes(permission)) return false;
      if (ev.grant.includes(permission)) return true;
    }
  }
  return snap.global.includes(permission);
}
