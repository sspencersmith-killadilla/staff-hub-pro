import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  listIntegrationSecrets,
  saveIntegrationSecret,
} from "@/lib/social.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute(
  "/_authenticated/staff/admin/social-integrations",
)({
  component: IntegrationsPage,
});

type Platform = "meta" | "linkedin";

const PLATFORM_META: Record<
  Platform,
  { label: string; help: string; defaultRedirect: string }
> = {
  meta: {
    label: "Meta (Facebook + Instagram)",
    help: "Create an app at developers.facebook.com. Add 'Facebook Login' and 'Instagram Graph API' products. Paste the App ID and App Secret here, and set the redirect URI in the Meta App settings to the one shown below.",
    defaultRedirect: "/api/public/oauth/meta/callback",
  },
  linkedin: {
    label: "LinkedIn",
    help: "Create an app at linkedin.com/developers. Request the 'Sign In with LinkedIn using OpenID Connect', 'Share on LinkedIn', and 'Advertising API' products. Add the redirect URL below to the Auth tab.",
    defaultRedirect: "/api/public/oauth/linkedin/callback",
  },
};

function IntegrationsPage() {
  const { isAdmin, loading } = useAuth();
  const list = useServerFn(listIntegrationSecrets);
  const { data: rows = [] } = useQuery({
    queryKey: ["social-integration-secrets"],
    queryFn: () => list(),
    enabled: isAdmin,
  });

  if (loading) return <div className="p-6 text-sm">Checking permissions…</div>;
  if (!isAdmin)
    return <div className="p-6 text-sm">Admin access required.</div>;

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <KeyRound className="h-7 w-7 text-primary" /> Social Integrations
        </h1>
        <p className="text-muted-foreground mt-1">
          Paste the OAuth credentials for each platform here. Once saved, staff
          with the Social Command permission can connect their department's
          accounts under Social → Connections.
        </p>
      </div>

      {(Object.keys(PLATFORM_META) as Platform[]).map((p) => {
        const existing = rows.find((r) => r.platform === p);
        return (
          <IntegrationCard
            key={p}
            platform={p}
            existing={existing}
            defaultRedirect={`${origin}${PLATFORM_META[p].defaultRedirect}`}
          />
        );
      })}
    </div>
  );
}

function IntegrationCard({
  platform,
  existing,
  defaultRedirect,
}: {
  platform: Platform;
  existing?: { client_id: string | null; redirect_uri: string | null; updated_at: string };
  defaultRedirect: string;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntegrationSecret);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirect, setRedirect] = useState("");

  useEffect(() => {
    setClientId(existing?.client_id ?? "");
    setRedirect(existing?.redirect_uri ?? defaultRedirect);
  }, [existing, defaultRedirect]);

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          platform,
          client_id: clientId,
          client_secret: clientSecret || undefined,
          redirect_uri: redirect,
        },
      }),
    onSuccess: () => {
      toast.success(`${PLATFORM_META[platform].label} saved`);
      setClientSecret("");
      qc.invalidateQueries({ queryKey: ["social-integration-secrets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{PLATFORM_META[platform].label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{PLATFORM_META[platform].help}</p>

        <div>
          <Label>Client / App ID</Label>
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </div>
        <div>
          <Label>Client / App Secret</Label>
          <Input
            type="password"
            placeholder={existing?.client_id ? "(leave blank to keep current)" : ""}
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
          />
        </div>
        <div>
          <Label>Redirect URI</Label>
          <Input value={redirect} onChange={(e) => setRedirect(e.target.value)} />
          <p className="text-xs text-muted-foreground mt-1">
            Paste this exact URL into the {PLATFORM_META[platform].label} app's
            allowed redirect list.
          </p>
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          Save
        </Button>
        {existing?.updated_at && (
          <p className="text-xs text-muted-foreground">
            Last updated {new Date(existing.updated_at).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
