import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { getPublicClass } from "@/lib/courses-public.functions";
import { enrollInSession } from "@/lib/courses.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/classes/$id")({
  component: ClassDetail,
});

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ClassDetail() {
  const { id } = Route.useParams();
  const { isAuthenticated, me } = useAuth();
  const cls = useQuery({
    queryKey: ["public-class", id],
    queryFn: () => getPublicClass({ data: { id } }),
  });
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    number: "",
    expiration: "",
    cvc: "",
    avs_zip: "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  const enroll = useMutation({
    mutationFn: () => {
      const price = Number(cls.data?.price ?? 0);
      const payload: any = {
        session_id: openSessionId!,
        full_name: form.full_name,
        email: form.email,
      };
      if (price > 0) {
        payload.card = {
          number: form.number,
          expiration: form.expiration,
          cvc: form.cvc,
          avs_zip: form.avs_zip || undefined,
        };
      }
      return enrollInSession({ data: payload });
    },
    onSuccess: (r: any) => {
      setMsg(
        r.already_enrolled
          ? "You're already enrolled in this session."
          : `Registration confirmed (${r.payment_status}).`,
      );
      setOpenSessionId(null);
      cls.refetch();
    },
    onError: (e: any) => setMsg(e?.message ?? "Registration failed"),
  });

  if (cls.isLoading)
    return (
      <div className="min-h-screen bg-slate-50">
        <SiteHeader />
        <div className="max-w-4xl mx-auto p-10">Loading…</div>
      </div>
    );
  if (!cls.data)
    return (
      <div className="min-h-screen bg-slate-50">
        <SiteHeader />
        <div className="max-w-4xl mx-auto p-10">Class not found.</div>
      </div>
    );

  const c = cls.data;
  const price = Number(c.price ?? 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Link to="/classes" className="text-sm text-blue-700 hover:underline">
          ← Back to classes
        </Link>
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden mt-4">
          {c.image_url && (
            <img
              src={c.image_url}
              alt={c.title}
              className="w-full h-64 object-cover"
            />
          )}
          <div className="p-6">
            <div className="text-xs uppercase tracking-wider text-slate-500">
              {c.department_name ?? "General"}
            </div>
            <h1 className="text-3xl font-black mt-1">{c.title}</h1>
            <div className="mt-2 text-lg font-semibold text-[#002f49]">
              {price > 0 ? `$${price.toFixed(2)} per registration` : "Free"}
            </div>
            {c.description && (
              <p className="mt-4 text-slate-700 whitespace-pre-wrap">
                {c.description}
              </p>
            )}

            <h2 className="text-xl font-bold mt-8 mb-3">Upcoming sessions</h2>
            {c.sessions.length === 0 && (
              <p className="text-slate-500">No upcoming sessions scheduled.</p>
            )}
            <div className="space-y-3">
              {c.sessions.map((s: any) => {
                const full = s.seats_left <= 0;
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between border rounded-lg p-4"
                  >
                    <div>
                      <div className="font-semibold">
                        {fmtDateTime(s.start_time)} →{" "}
                        {new Date(s.end_time).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                      <div className="text-sm text-slate-600">
                        {s.venue_name && `${s.venue_name} · `}
                        {s.room_name ?? "Room TBD"}
                        {s.instructor_name && ` · ${s.instructor_name}`}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {s.enrolled} / {s.capacity} enrolled ·{" "}
                        {full ? "Full" : `${s.seats_left} seats left`}
                      </div>
                    </div>
                    {isAuthenticated ? (
                      <Button
                        disabled={full}
                        onClick={() => {
                          setMsg(null);
                          setForm((f) => ({
                            ...f,
                            full_name:
                              me?.full_name ?? f.full_name,
                            email: me?.email ?? f.email,
                          }));
                          setOpenSessionId(s.id);
                        }}
                      >
                        {full ? "Full" : "Register"}
                      </Button>
                    ) : (
                      <Link to="/login">
                        <Button variant="outline">Sign in to register</Button>
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
            {msg && (
              <p className="mt-4 text-sm text-blue-700">{msg}</p>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={!!openSessionId}
        onOpenChange={(o) => !o && setOpenSessionId(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {price > 0
                ? `Register · $${price.toFixed(2)}`
                : "Register (Free)"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Full Name</Label>
              <Input
                value={form.full_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, full_name: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            {price > 0 && (
              <>
                <div>
                  <Label>Card Number</Label>
                  <Input
                    value={form.number}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, number: e.target.value }))
                    }
                    placeholder="4111 1111 1111 1111"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>Exp MM/YY</Label>
                    <Input
                      value={form.expiration}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, expiration: e.target.value }))
                      }
                      placeholder="12/27"
                    />
                  </div>
                  <div>
                    <Label>CVC</Label>
                    <Input
                      value={form.cvc}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, cvc: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Zip</Label>
                    <Input
                      value={form.avs_zip}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, avs_zip: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpenSessionId(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={enroll.isPending || !form.full_name || !form.email}
              onClick={() => enroll.mutate()}
            >
              {enroll.isPending ? "Processing…" : "Confirm Registration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
