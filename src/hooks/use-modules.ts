import { useQuery } from "@tanstack/react-query";
import {
  listPlatformModules,
  type ModuleKey,
  type PlatformModule,
} from "@/lib/platform-modules.functions";

const DEFAULTS: Record<ModuleKey, boolean> = {
  vendors_sponsors: true,
  streetbeats: true,
  community_orgs: true,
  room_reservations: true,
  classes: true,
  box_office: true,
  venues: true,
  social_command: true,
  guidebook: true,
  events: true,
  civic_quests: true,
};

export function useModules() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-modules"],
    queryFn: () => listPlatformModules(),
    staleTime: 60_000,
  });

  const flags: Record<ModuleKey, boolean> = { ...DEFAULTS };
  for (const m of data ?? []) flags[m.key as ModuleKey] = m.enabled;

  return {
    modules: (data ?? []) as PlatformModule[],
    flags,
    isEnabled: (key: ModuleKey) => flags[key],
    isLoading,
  };
}
