import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  getEmailSettings,
  saveEmailSettings,
  sendProviderTest,
} from "@/lib/email-settings.functions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute(
  "/_authenticated/staff/admin/email-settings",
)({
  component: EmailSettingsPage,
});

function EmailSettingsPage() {
  const { isAdmin, loading } = useAuth();
  const get = useServerFn(getEmailSettings);
  const save = useServerFn(saveEmailSettings);
  const test = useServerFn(sendProviderTest);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["email-settings"],
    queryFn: () => get(),
    enabled: isAdmin,
  });

  const [from, setFrom] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    if (!data) return;
    setFrom(data.from_address ?? "");
    setReplyTo(data.reply_to ?? "");
    setSiteUrl(data.site_url ?? "");
    setIsActive(data.is_active);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          provider: "resend",
          from_address: from,
          reply_to: replyTo,
          site_url: siteUrl,
          api_key: apiKey || undefined,
          is_active: isActive,
        },
      }),
    onSuccess: () => {
      toast.success("Email settings saved");
      setApiKey("");
      qc.invalidateQueries({ queryKey: ["email-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: () => test({ data: { to: testTo } }),
    onSuccess: () => toast.success(`Test email sent to ${testTo}`),
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <div className="p-6 text-sm">Checking permissions…</div>;
  if (!isAdmin)
    return <div className="p-6 text-sm">Admin access required.</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Mail className="h-7 w-7 text-primary" /> Email Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure how outgoing emails are sent from the Communications
          module. Once saved and activated, staff can send campaigns and test
          messages without any environment-variable setup.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resend</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
            <p className="font-medium">Quick setup (free tier: 3,000 emails / month)</p>
            <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
              <li>
                Create a free account at{" "}
                <a
                  href="https://resend.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  resend.com
                </a>
                .
              </li>
              <li>
                Verify a domain you own under <strong>Domains</strong> (or skip
                and use the sandbox sender for testing only — capped at 100/day).
              </li>
              <li>
                Create an API key under{" "}
                <a
                  href="https://resend.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  API Keys
                </a>{" "}
                and paste it below.
              </li>
              <li>Turn on "Active" and save.</li>
            </ol>
          </div>

          <div>
            <Label>From address</Label>
            <Input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="City Events <hello@yourcity.gov>"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Must use a domain you've verified in Resend. Leave blank to use
              the Resend sandbox sender <code>onboarding@resend.dev</code> for
              testing.
            </p>
          </div>

          <div>
            <Label>Reply-to (optional)</Label>
            <Input
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="events@yourcity.gov"
            />
          </div>

          <div>
            <Label>Public site URL</Label>
            <Input
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://yourcity.gov"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Used to build the one-click unsubscribe link in every email.
            </p>
          </div>

          <div>
            <Label>Resend API key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                data?.has_api_key ? "•••••••• (leave blank to keep current)" : "re_..."
              }
            />
            <p className="text-xs text-muted-foreground mt-1">
              Stored securely. Never displayed back after saving.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} id="email-active" />
            <Label htmlFor="email-active" className="!m-0">
              Active — use these settings to send mail
            </Label>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || isLoading}>
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
            {data?.updated_at && (
              <span className="text-xs text-muted-foreground">
                Last updated {new Date(data.updated_at).toLocaleString()}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Send a test email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Uses the saved settings above. Make sure you've clicked Save first.
          </p>
          <div className="flex gap-2">
            <Input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
            />
            <Button
              onClick={() => testMut.mutate()}
              disabled={!testTo || testMut.isPending}
            >
              {testMut.isPending ? "Sending…" : "Send test"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
