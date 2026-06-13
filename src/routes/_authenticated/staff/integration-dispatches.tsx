import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useState } from "react";
import { Activity, RotateCw, ChevronRight, ChevronDown } from "lucide-react";
import { waitForSupabaseSession } from "@/integrations/supabase/auth-ready";
import { canManageWpoIntegration } from "@/lib/workplanos.functions";
import {
  listRecentWpoDispatches,
  retryWpoDispatch,
  resendWpoEvent,
} from "@/lib/wpo-dispatch.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/staff/integration-dispatches")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const session = await waitForSupabaseSession();
    if (!session?.user) throw redirect({ to: "/login" });
    const ok = await canManageWpoIntegration();
    if (!ok) throw redirect({ to: "/staff" });
  },
  component: IntegrationDispatchesPage,
});

type Row = {
  id: string;
  direction: string;
  status_code: number | null;
  error: string | null;
  attempts: number;
  event_id: string | null;
  department_id: string | null;
  created_at: string;
  next_retry_at: string | null;
  payload?: any;
};

function IntegrationDispatchesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listRecentWpoDispatches);
  const retry = useServerFn(retryWpoDispatch);
  const resend = useServerFn(resendWpoEvent);
  const [expanded, setExpanded] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["wpo-all-dispatches"],
    queryFn: () => list({ data: {} }),
    refetchInterval: 10_000,
  });

  const retryMut = useMutation({
    mutationFn: (id: string) => retry({ data: { dispatchId: id } }),
    onSuccess: (res: any) => {
      if (res?.ok) toast.success("Retry sent");
      else if (res?.skipped) toast.message(`Skipped: ${res.reason}`);
      else toast.error(`Error: ${res?.error ?? "unknown"}`);
      qc.invalidateQueries({ queryKey: ["wpo-all-dispatches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resendMut = useMutation({
    mutationFn: (eventId: string) =>
      resend({ data: { eventId, type: "event.updated" } }),
    onSuccess: (res: any) => {
      if (res?.ok) toast.success("Resent");
      else if (res?.skipped) toast.message(`Skipped: ${res.reason}`);
      else toast.error(`Error: ${res?.error ?? "unknown"}`);
      qc.invalidateQueries({ queryKey: ["wpo-all-dispatches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (q.data ?? []) as Row[];

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Activity className="h-7 w-7 text-primary" /> Integration dispatches
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Latest 50 inbound + outbound WorkPlanOS sync attempts across your departments.{" "}
          <Link to="/staff/integrations" className="underline">Configure integration</Link>
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent activity</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ["wpo-all-dispatches"] })}
          >
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No dispatches yet. Updating an event should produce an outbound row here.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="w-[160px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => {
                  const failed =
                    d.status_code == null || d.status_code >= 400;
                  const isOut = d.direction === "outbound";
                  const isOpen = expanded === d.id;
                  return (
                    <>
                      <TableRow key={d.id}>
                        <TableCell>
                          <button
                            onClick={() => setExpanded(isOpen ? null : d.id)}
                            className="text-muted-foreground"
                            aria-label="Toggle payload"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(d.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={isOut ? "default" : "outline"}>
                            {d.direction}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={failed ? "text-destructive font-medium" : ""}>
                            {d.status_code ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-mono truncate max-w-[160px]">
                          {d.event_id ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">
                          {d.error ?? ""}
                        </TableCell>
                        <TableCell className="space-x-2">
                          {isOut && failed && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retryMut.mutate(d.id)}
                              disabled={retryMut.isPending}
                            >
                              <RotateCw className="h-3.5 w-3.5 mr-1" /> Retry
                            </Button>
                          )}
                          {isOut && d.event_id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => resendMut.mutate(d.event_id!)}
                              disabled={resendMut.isPending}
                            >
                              Resend
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={`${d.id}-payload`}>
                          <TableCell colSpan={7} className="bg-muted/30">
                            <pre className="text-xs whitespace-pre-wrap break-all max-h-80 overflow-auto">
                              {JSON.stringify(d.payload ?? {}, null, 2)}
                            </pre>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
