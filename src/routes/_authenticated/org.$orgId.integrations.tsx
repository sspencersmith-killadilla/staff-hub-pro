import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plug, Copy, KeyRound, AlertTriangle } from "lucide-react";
import {
  getWpoIntegration,
  saveWpoIntegration,
  rotateWpoSecret,
  disableWpoIntegration,
  listWpoDispatches,
  listMyOwnedOrgs,
} from "@/lib/workplanos.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/org/$orgId/integrations")({
  component: OrgIntegrationsPage,
});

function copyText(text: string, label: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Copy failed"),
    );
  }
}

function OrgIntegrationsPage() {
  const { orgId } = Route.useParams();
  const qc = useQueryClient();

  const getInteg = useServerFn(getWpoIntegration);
  const save = useServerFn(saveWpoIntegration);
  const rotate = useServerFn(rotateWpoSecret);
  const disable = useServerFn(disableWpoIntegration);
  const listDisp = useServerFn(listWpoDispatches);
  const listOrgs = useServerFn(listMyOwnedOrgs);

  // Owner guard: page only renders if this user owns the org.
  const ownedOrgsQ = useQuery({
    queryKey: ["my-owned-orgs"],
    queryFn: () => listOrgs(),
  });
  const isOwner = (ownedOrgsQ.data ?? []).some((o) => o.id === orgId);

  const integQ = useQuery({
    queryKey: ["wpo-integration", orgId],
    queryFn: () => getInteg({ data: { orgId } }),
    enabled: !!ownedOrgsQ.data && isOwner,
  });

  const dispQ = useQuery({
    queryKey: ["wpo-dispatches", orgId],
    queryFn: () => listDisp({ data: { orgId } }),
    enabled: !!ownedOrgsQ.data && isOwner,
    refetchInterval: 15_000,
  });

  const [baseUrl, setBaseUrl] = useState("https://workplanos.lovable.app");
  const [workspaceId, setWorkspaceId] = useState("");
  const [newSecret, setNewSecret] = useState<string | null>(null);

  useEffect(() => {
    if (integQ.data) {
      setBaseUrl(integQ.data.wpo_base_url || "https://workplanos.lovable.app");
      setWorkspaceId(integQ.data.wpo_workspace_id ?? "");
    }
  }, [integQ.data]);

  const saveMut = useMutation({
    mutationFn: (enabled?: boolean) =>
      save({
        data: {
          orgId,
          wpo_base_url: baseUrl.trim(),
          wpo_workspace_id: workspaceId.trim() || null,
          enabled,
        },
      }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["wpo-integration", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rotateMut = useMutation({
    mutationFn: () => rotate({ data: { orgId } }),
    onSuccess: (res) => {
      setNewSecret(res.secret);
      toast.success("Shared secret generated");
      qc.invalidateQueries({ queryKey: ["wpo-integration", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disableMut = useMutation({
    mutationFn: () => disable({ data: { orgId } }),
    onSuccess: () => {
      toast.success("Integration disabled");
      qc.invalidateQueries({ queryKey: ["wpo-integration", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (ownedOrgsQ.isLoading) {
    return <div className="p-6 text-sm">Loading…</div>;
  }
  if (!isOwner) {
    return (
      <div className="p-6 text-sm">
        You don't have access to this organization's integrations.
      </div>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inboundUrl = `${origin}/api/public/integrations/wpo/inbound`;
  const integ = integQ.data;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Plug className="h-7 w-7 text-primary" /> Integrations
        </h1>
        <p className="text-muted-foreground mt-1">
          Connect external systems to this organization.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              WorkPlanOS
              {integ?.enabled ? (
                <Badge variant="default">Enabled</Badge>
              ) : (
                <Badge variant="secondary">Disabled</Badge>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label>WorkPlanOS base URL</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://workplanos.lovable.app"
            />
          </div>
          <div>
            <Label>WorkPlanOS workspace ID</Label>
            <Input
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              placeholder="Paste from WPO → Integrations"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveMut.mutate(undefined)} disabled={saveMut.isPending}>
              Save settings
            </Button>
            <Button
              variant="outline"
              onClick={() => rotateMut.mutate()}
              disabled={rotateMut.isPending}
            >
              <KeyRound className="h-4 w-4 mr-2" />
              {integ?.has_secret ? "Rotate shared secret" : "Generate shared secret"}
            </Button>
            {integ?.enabled && (
              <Button
                variant="destructive"
                onClick={() => disableMut.mutate()}
                disabled={disableMut.isPending}
              >
                Disable
              </Button>
            )}
          </div>

          {newSecret && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Copy this secret now — it will not be shown again.
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs break-all rounded bg-background p-2 border">
                  {newSecret}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyText(newSecret, "Secret")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setNewSecret(null)}>
                I've saved it
              </Button>
            </div>
          )}

          {integ?.has_secret && !newSecret && (
            <div className="text-sm text-muted-foreground">
              Current shared secret:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                {integ.secret_masked}
              </code>
            </div>
          )}

          <div className="border-t pt-4 space-y-3">
            <h3 className="text-sm font-semibold">Inbound webhook</h3>
            <p className="text-sm text-muted-foreground">
              Configure WorkPlanOS to send events to this URL with the headers below.
            </p>

            <FieldCopy label="Webhook URL" value={inboundUrl} />
            <FieldCopy label="Header: x-wpo-workspace" value={orgId} />
            <FieldCopy
              label="Header: x-wpo-signature"
              value="sha256=<hmac_sha256(shared_secret, raw_body)>"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent dispatches</CardTitle>
        </CardHeader>
        <CardContent>
          {(dispQ.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground">No activity yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(dispQ.data ?? []).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(d.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{d.direction}</Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          d.status_code && d.status_code >= 400
                            ? "text-destructive font-medium"
                            : ""
                        }
                      >
                        {d.status_code ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                      {d.error ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FieldCopy({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2 mt-1">
        <code className="flex-1 text-xs break-all rounded bg-muted p-2">{value}</code>
        <Button size="sm" variant="outline" onClick={() => copyText(value, label)}>
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
