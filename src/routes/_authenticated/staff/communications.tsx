import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listCampaigns, saveCampaign, deleteCampaign } from "@/lib/campaigns.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/use-permissions";
import { Plus, Mail, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff/communications")({
  component: CommunicationsPage,
});

function CommunicationsPage() {
  const { can, loading } = usePermissions();
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => listCampaigns(),
    enabled: can("page.communications"),
  });

  const create = useMutation({
    mutationFn: () =>
      saveCampaign({
        data: {
          subject: "Untitled campaign",
          body_html: "",
          target_audience_rules: { segments: [] },
        },
      }),
    onSuccess: (row: any) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      navigate({ to: "/staff/communications/$id", params: { id: row.id } });
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteCampaign({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!can("page.communications")) {
    return <div className="p-8"><h1 className="text-xl font-semibold">No access</h1><p className="text-sm text-muted-foreground">You need the Communications permission.</p></div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Communications</h1>
          <p className="text-sm text-muted-foreground">Send email campaigns to your community.</p>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="h-4 w-4 mr-2" /> New campaign
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-sm text-muted-foreground">Loading…</div>
          ) : campaigns.length === 0 ? (
            <div className="p-12 text-center">
              <Mail className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No campaigns yet.</p>
            </div>
          ) : (
            <div className="divide-y">
              {campaigns.map((c: any) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <Link
                    to="/staff/communications/$id"
                    params={{ id: c.id }}
                    className="flex-1 min-w-0"
                  >
                    <div className="font-medium truncate">{c.subject}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.status === "sent" && c.sent_at && `Sent ${new Date(c.sent_at).toLocaleString()} • ${c.recipient_count} recipients`}
                      {c.status === "scheduled" && c.scheduled_for && `Scheduled for ${new Date(c.scheduled_for).toLocaleString()}`}
                      {c.status === "draft" && `Draft • Updated ${new Date(c.created_at).toLocaleDateString()}`}
                      {c.status === "sending" && "Sending…"}
                      {c.status === "failed" && "Failed"}
                    </div>
                  </Link>
                  <StatusBadge status={c.status} />
                  <button
                    onClick={() => { if (confirm("Delete this campaign?")) del.mutate(c.id); }}
                    className="text-muted-foreground hover:text-red-600 p-2"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-slate-200 text-slate-700",
    scheduled: "bg-blue-100 text-blue-700",
    sending: "bg-amber-100 text-amber-700",
    sent: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };
  return <Badge className={map[status] ?? ""}>{status}</Badge>;
}
