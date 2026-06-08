import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAssetHistory } from "@/lib/assets.functions";
import { ArrowLeft, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff/assets/$id")({
  head: () => ({ meta: [{ title: "Asset · Staff" }] }),
  component: AssetDetailPage,
});

function AssetDetailPage() {
  const { id } = Route.useParams();
  const fetchHistory = useServerFn(getAssetHistory);
  const { data, isLoading } = useQuery({
    queryKey: ["asset-history", id],
    queryFn: () => fetchHistory({ data: { asset_id: id } }),
  });

  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  const { asset, tickets, costs, total_cost } = data;
  const costByTicket: Record<string, number> = {};
  for (const c of costs as any[]) {
    costByTicket[c.ticket_id] = (costByTicket[c.ticket_id] ?? 0) + Number(c.amount);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b bg-white px-6 py-4">
        <Link to="/staff/assets" className="inline-flex items-center gap-1 text-xs text-amber-700 hover:underline">
          <ArrowLeft className="h-3 w-3" /> All assets
        </Link>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-[#002f49]">{asset.name}</h1>
        <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{asset.asset_type}</div>
        {asset.address && (
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />{asset.address}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-auto bg-slate-50 p-4">
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat label="Tickets" value={String((tickets as any[]).length)} />
          <Stat label="Total cost" value={`$${Number(total_cost).toFixed(2)}`} />
          <Stat label="Installed" value={asset.install_date ?? "—"} />
        </div>

        <div className="rounded-xl border bg-white">
          <div className="border-b bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            Service history
          </div>
          {(tickets as any[]).length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">No tickets linked yet.</p>
          ) : (
            <ul className="divide-y">
              {(tickets as any[]).map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 px-3 py-3 text-sm">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                      {t.category?.name} · {t.status}
                    </div>
                    <p className="line-clamp-2">{t.description}</p>
                    <div className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
                  </div>
                  <div className="text-right text-sm font-bold">${(costByTicket[t.id] ?? 0).toFixed(2)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-[#002f49]">{value}</div>
    </div>
  );
}
