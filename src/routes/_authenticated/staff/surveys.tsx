import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listSurveys, saveSurvey, deleteSurvey } from "@/lib/surveys.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/use-permissions";
import { Plus, ClipboardList, BarChart3, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff/surveys")({
  component: SurveysPage,
});

function SurveysPage() {
  const { can, loading } = usePermissions();
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const { data: surveys = [], isLoading } = useQuery({
    queryKey: ["surveys"],
    queryFn: () => listSurveys(),
    enabled: can("page.surveys"),
  });

  const create = useMutation({
    mutationFn: () =>
      saveSurvey({
        data: { title: "Untitled survey", description_html: "", is_active: true, questions: [] },
      }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["surveys"] });
      navigate({ to: "/staff/surveys/$id", params: { id: r.id } });
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteSurvey({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["surveys"] }),
  });

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!can("page.surveys")) {
    return <div className="p-8"><h1 className="text-xl font-semibold">No access</h1></div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Surveys & Feedback</h1>
          <p className="text-sm text-muted-foreground">Collect anonymous feedback from your community.</p>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="h-4 w-4 mr-2" /> New survey
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-sm text-muted-foreground">Loading…</div>
          ) : surveys.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No surveys yet.</p>
            </div>
          ) : (
            <div className="divide-y">
              {surveys.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <Link to="/staff/surveys/$id" params={{ id: s.id }} className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.title}</div>
                    <div className="text-xs text-muted-foreground">
                      Created {new Date(s.created_at).toLocaleDateString()}
                    </div>
                  </Link>
                  {s.is_active ? <Badge className="bg-green-100 text-green-700">Active</Badge> : <Badge>Inactive</Badge>}
                  <Link to="/staff/surveys/$id/analytics" params={{ id: s.id }} className="p-2 text-muted-foreground hover:text-foreground">
                    <BarChart3 className="h-4 w-4" />
                  </Link>
                  <button onClick={() => { if (confirm("Delete survey?")) del.mutate(s.id); }} className="p-2 text-muted-foreground hover:text-red-600">
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
