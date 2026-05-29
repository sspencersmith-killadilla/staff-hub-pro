import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Facebook, Instagram, Linkedin, Plug, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useDepartment } from "@/contexts/department-context";
import {
  listConnections,
  disconnectAccount,
  startOAuth,
} from "@/lib/social.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute(
  "/_authenticated/staff/admin/social/connections",
)({
  component: ConnectionsPage,
});

const ICONS = {
  facebook: Facebook,
  instagram: Instagram,
  linkedin: Linkedin,
} as const;

function ConnectionsPage() {
  const { activeDepartment } = useDepartment();
  const qc = useQueryClient();
  const list = useServerFn(listConnections);
  const disconnect = useServerFn(disconnectAccount);
  const start = useServerFn(startOAuth);

  const departmentId = activeDepartment?.id;
  const { data: conns = [] } = useQuery({
    queryKey: ["social-connections", departmentId],
    queryFn: () => list({ data: { departmentId: departmentId! } }),
    enabled: !!departmentId,
  });

  const begin = useMutation({
    mutationFn: (platform: "meta" | "linkedin") =>
      start({ data: { platform, departmentId: departmentId! } }),
    onSuccess: ({ authorizeUrl }) => {
      window.location.href = authorizeUrl;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => disconnect({ data: { id } }),
    onSuccess: () => {
      toast.success("Disconnected");
      qc.invalidateQueries({ queryKey: ["social-connections"] });
    },
  });

  if (!departmentId)
    return <div className="p-6 text-sm text-muted-foreground">Select a department first.</div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Plug className="h-7 w-7 text-primary" /> Social Connections
        </h1>
        <p className="text-muted-foreground mt-1">
          Connect <strong>{activeDepartment?.name}</strong>'s Facebook Page, Instagram
          Business account, and LinkedIn so the Social Command Center can publish
          on its behalf.
        </p>
        <Link
          to="/staff/admin/social"
          className="text-sm text-primary hover:underline mt-2 inline-block"
        >
          ← Back to Social Command
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Facebook className="h-5 w-5 text-blue-600" /> Facebook + Instagram
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              One Meta sign-in connects both your Facebook Pages and any linked
              Instagram Business accounts.
            </p>
            <Button onClick={() => begin.mutate("meta")} disabled={begin.isPending}>
              Connect Meta
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Linkedin className="h-5 w-5 text-blue-700" /> LinkedIn
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Posts will go out as the connecting LinkedIn member.
            </p>
            <Button onClick={() => begin.mutate("linkedin")} disabled={begin.isPending}>
              Connect LinkedIn
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connected accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {conns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No accounts connected yet.</p>
          ) : (
            <ul className="divide-y">
              {conns.map((c) => {
                const Icon = ICONS[c.platform as keyof typeof ICONS];
                return (
                  <li key={c.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5" />
                      <div>
                        <div className="font-medium">{c.account_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.platform}
                          {c.token_expires_at &&
                            ` • expires ${new Date(c.token_expires_at).toLocaleDateString()}`}
                        </div>
                      </div>
                      <Badge variant="secondary" className="ml-2">connected</Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove.mutate(c.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
