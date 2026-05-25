import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Switch } from "@/components/ui/switch";
import { getMyRoles } from "@/lib/auth.functions";
import {
  listPlatformModules,
  setPlatformModule,
  type PlatformModule,
} from "@/lib/platform-modules.functions";

export const Route = createFileRoute("/_authenticated/staff/settings")({
  beforeLoad: async () => {
    const me = await getMyRoles();
    if (!me.roles.includes("admin")) throw redirect({ to: "/staff" });
  },
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const saveModule = useServerFn(setPlatformModule);
  const { data: modules = [], isLoading } = useQuery({
    queryKey: ["platform-modules"],
    queryFn: () => listPlatformModules(),
  });

  const toggle = useMutation({
    mutationFn: (v: { key: string; enabled: boolean }) =>
      saveModule({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["platform-modules"] });
      const prev = qc.getQueryData<PlatformModule[]>(["platform-modules"]);
      qc.setQueryData<PlatformModule[]>(["platform-modules"], (old) =>
        (old ?? []).map((m) => (m.key === v.key ? { ...m, enabled: v.enabled } : m)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["platform-modules"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["platform-modules"] }),
  });

  return (
    <div className="px-8 py-10">
      <div className="mb-8">
        <h1 className="text-4xl font-black tracking-tight text-[hsl(210_60%_12%)]">
          Platform Module Settings
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Toggle visibility of specific portal features across the entire platform.
        </p>
      </div>

      <div className="max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-8 text-sm text-slate-500">Loading…</div>
        ) : modules.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">
            No modules configured. Run the platform_modules migration.
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {modules.map((m) => (
              <li
                key={m.key}
                className="flex items-center justify-between gap-6 px-8 py-6"
              >
                <div className="min-w-0">
                  <div className="text-base font-bold text-[hsl(210_60%_12%)]">
                    {m.label}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{m.description}</p>
                </div>
                <Switch
                  checked={m.enabled}
                  disabled={toggle.isPending}
                  onCheckedChange={(checked) =>
                    toggle.mutate({ key: m.key, enabled: checked })
                  }
                  className="data-[state=checked]:bg-emerald-500"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      {toggle.error && (
        <p className="mt-4 text-sm text-destructive">
          {(toggle.error as Error).message}
        </p>
      )}
    </div>
  );
}
