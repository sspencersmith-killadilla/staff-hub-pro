import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listMyPermits, deleteMyDraftPermit } from "@/lib/permits.functions";
import { Trash2, FileText, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/my-permits")({
  head: () => ({
    meta: [
      { title: "My Permits" },
      {
        name: "description",
        content: "Resume drafts and track the status of your Special Event Permit applications.",
      },
    ],
  }),
  component: MyPermitsPage,
});

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-200 text-slate-800",
  pending_review: "bg-amber-100 text-amber-900",
  approved: "bg-blue-100 text-blue-900",
  paid: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
};

function MyPermitsPage() {
  const qc = useQueryClient();
  const fetchMine = useServerFn(listMyPermits);
  const delFn = useServerFn(deleteMyDraftPermit);

  const { data: permits = [], isLoading } = useQuery({
    queryKey: ["my-permits"],
    queryFn: () => fetchMine(),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Draft deleted");
      qc.invalidateQueries({ queryKey: ["my-permits"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[#002f49]">
              My Permits
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Resume drafts or track the status of your Special Event Permit applications.
            </p>
          </div>
          <Link to="/events/permits/apply">
            <Button>
              <Plus className="mr-1 h-4 w-4" /> New Application
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : permits.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No permits yet. Start a new Special Event Permit application.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {permits.map((p: any) => {
              const name =
                (p.event_details as any)?.event_name?.toString().trim() ||
                "Untitled permit";
              return (
                <Card key={p.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-bold">{name}</h3>
                        <Badge className={STATUS_COLOR[p.status] ?? ""}>
                          {p.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.event_type?.label ?? "—"}
                        {p.calculated_fee != null && (
                          <> · Fee: ${Number(p.calculated_fee).toFixed(2)}</>
                        )}
                        {" · Updated "}
                        {new Date(p.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        to="/events/permits/apply"
                        search={{ id: p.id }}
                      >
                        <Button size="sm" variant="outline">
                          {p.status === "draft" ? "Resume" : "View"}
                        </Button>
                      </Link>
                      {p.status === "draft" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Delete this draft?")) del.mutate(p.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
