import { useQuery } from "@tanstack/react-query";
import { getMyPermissions } from "@/lib/staff-permissions.functions";
import {
  canPermission,
  type PermissionKey,
  type PermissionsSnapshot,
} from "@/lib/staff-permissions";
import { useAuth } from "@/hooks/use-auth";

export function usePermissions() {
  const { isStaff, loading: authLoading } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => getMyPermissions(),
    enabled: isStaff && !authLoading,
    staleTime: 60_000,
  });

  const snap: PermissionsSnapshot | null = data ?? null;

  return {
    loading: authLoading || (isStaff && isLoading),
    snapshot: snap,
    can: (permission: PermissionKey, eventId?: string) =>
      canPermission(snap, permission, eventId),
  };
}
