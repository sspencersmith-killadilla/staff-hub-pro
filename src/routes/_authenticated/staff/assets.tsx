import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAssets } from "@/lib/assets.functions";
import { Input } from "@/components/ui/input";
import { Wrench } from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff/assets")({
  head: () => ({ meta: [{ title: "Assets · Staff" }] }),
  component: AssetsListPage,
});

function AssetsListPage() {
  const [search, setSearch] = useState("");
  const fetchAssets = useServerFn(listAssets);
  const { data, isLoading } = useQuery({
    queryKey: ["assets", search],
    queryFn: () => fetchAssets({ data: { search: search || undefined } }),
  });

  return (
    <div className="flex h-full flex-col">
      <header className="border-b bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-700">311 · Assets</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-[#002f49]">Asset registry</h1>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assets…"
            className="w-72"
          />
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-slate-50 p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (data ?? []).length === 0 ? (
          <div className="rounded-xl border bg-white p-10 text-center text-muted-foreground">
            No assets yet. Create assets from a ticket's Asset tab.
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(data ?? []).map((a: any) => (
              <li key={a.id}>
                <Link
                  to="/staff/assets/$id"
                  params={{ id: a.id }}
                  className="block rounded-xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded bg-amber-100 p-2 text-amber-700"><Wrench className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[#002f49]">{a.name}</div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">{a.asset_type}</div>
                      {a.address && <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{a.address}</div>}
                      {a.department?.name && <div className="mt-1 text-[10px] text-amber-700">{a.department.name}</div>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
