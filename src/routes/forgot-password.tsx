import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordPage });

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => { if (typeof window !== "undefined") setOrigin(window.location.origin); }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setMsg(""); setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset-password`,
    });
    setLoading(false);
    if (error) setError(error.message);
    else setMsg("Check your email for a reset link.");
  };

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-md px-4 py-12">
        <Card>
          <CardHeader><CardTitle>Reset your password</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" className="underline">Back to sign in</Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
