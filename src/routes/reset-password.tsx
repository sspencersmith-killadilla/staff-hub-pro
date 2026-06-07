import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/reset-password")({ component: ResetPasswordPage });

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase populates session from the recovery link via detectSessionInUrl.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setMsg("");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("Passwords do not match");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(error.message);
    setMsg("Password updated. Redirecting…");
    setTimeout(() => navigate({ to: "/hub" }), 1500);
  };

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-md px-4 py-12">
        <Card>
          <CardHeader><CardTitle>Choose a new password</CardTitle></CardHeader>
          <CardContent>
            {!ready ? (
              <p className="text-sm text-muted-foreground">
                Open this page from the reset link in your email.
              </p>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="password">New password</Label>
                  <Input id="password" type="password" value={password} minLength={8}
                    onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="confirm">Confirm</Label>
                  <Input id="confirm" type="password" value={confirm} minLength={8}
                    onChange={(e) => setConfirm(e.target.value)} required />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Updating…" : "Update password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
