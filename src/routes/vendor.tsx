import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import {
  listOpenSessions,
  listTiers,
  listMyApplications,
  submitApplication,
  updateApplication,
  cancelApplication,
} from "@/lib/vendor-portal.functions";

const RobustMap = lazy(() => import("@/components/RobustMap"));

export const Route = createFileRoute("/vendor")({
  head: () => ({
    meta: [
      { title: "Vendor & Sponsor Portal" },
      {
        name: "description",
        content:
          "Apply to be a vendor or sponsor at upcoming community events.",
      },
      { property: "og:title", content: "Vendor & Sponsor Portal" },
      {
        property: "og:description",
        content:
          "Apply to be a vendor or sponsor at upcoming community events.",
      },
    ],
  }),
  component: VendorPortal,
});

function VendorPortal() {
  const [user, setUser] = useState<any>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setIsCheckingAuth(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (isCheckingAuth) {
    return <div className="min-h-screen bg-[#f4f6f9]" />;
  }
  if (!user) return <AuthGate />;
  return <PortalDashboard user={user} />;
}

// ─── Auth gate (email/password sign in / sign up) ─────────────────────
function AuthGate() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (isLoginMode) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) alert("Error: " + error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) alert("Error: " + error.message);
      else alert("Account created successfully!");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <SiteHeader />
      <main className="flex items-center justify-center p-6 font-sans py-16">
        <div className="bg-white p-10 rounded-xl shadow-lg border border-gray-200 max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-[#112e51] tracking-tight mb-2">
              Sponsorship and Vendor Opportunities
            </h1>
            <p className="text-gray-500 text-sm">Partner Operations Hub</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                Business Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hello@yourbusiness.com"
                className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-0 focus:border-[#005ea2] outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-0 focus:border-[#005ea2] outline-none"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#005ea2] hover:bg-[#1a4480] text-white font-bold py-3.5 rounded-lg transition-colors shadow-md"
            >
              {loading
                ? "Authenticating…"
                : isLoginMode
                  ? "Access My Dashboard"
                  : "Create Account"}
            </button>
          </form>
          <div className="mt-6 text-center">
            <button
              onClick={() => setIsLoginMode(!isLoginMode)}
              className="text-[#005ea2] hover:underline text-sm font-bold"
            >
              {isLoginMode
                ? "Need an account? Sign Up"
                : "Already have an account? Log In"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Authenticated dashboard ──────────────────────────────────────────
type Tab = "dashboard" | "apply";
type Kind = "vendor" | "sponsor";

function PortalDashboard({ user }: { user: any }) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  const fetchApps = useServerFn(listMyApplications);
  const { data } = useQuery({
    queryKey: ["vendor-portal", "apps", user.id],
    queryFn: () => fetchApps(),
  });
  const vendors = data?.vendors ?? [];
  const sponsors = data?.sponsors ?? [];

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["vendor-portal", "apps", user.id] });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-[#f4f6f9] font-sans text-[#1b1b1b]">
      <SiteHeader />
      <header className="bg-[#112e51] text-white py-6 px-8 shadow-md">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Partner Operations Hub
            </h1>
            <p className="text-[#aebecf] text-xs font-medium uppercase tracking-widest mt-1">
              {user.email}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm font-bold text-[#aebecf] hover:text-white transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto py-10 px-6 pb-16">
        <div className="flex gap-4 mb-8 border-b border-gray-300 pb-1">
          <TabButton
            active={activeTab === "dashboard"}
            onClick={() => setActiveTab("dashboard")}
          >
            My Applications
          </TabButton>
          <TabButton
            active={activeTab === "apply"}
            onClick={() => setActiveTab("apply")}
          >
            Apply for Event
          </TabButton>
        </div>

        {activeTab === "dashboard" && (
          <DashboardTab
            vendors={vendors}
            sponsors={sponsors}
            onRefresh={refresh}
            goApply={() => setActiveTab("apply")}
          />
        )}

        {activeTab === "apply" && (
          <ApplyTab
            user={user}
            onSubmitted={() => {
              refresh();
              setActiveTab("dashboard");
            }}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`pb-2 text-lg font-bold transition-colors ${
        active
          ? "text-[#005ea2] border-b-4 border-[#005ea2]"
          : "text-gray-500 hover:text-[#112e51]"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Dashboard tab ────────────────────────────────────────────────────
function DashboardTab({
  vendors,
  sponsors,
  onRefresh,
  goApply,
}: {
  vendors: any[];
  sponsors: any[];
  onRefresh: () => void;
  goApply: () => void;
}) {
  if (vendors.length === 0 && sponsors.length === 0) {
    return (
      <div className="bg-white p-12 text-center rounded-xl border border-gray-200 shadow-sm">
        <p className="text-gray-500 text-lg font-medium">
          You haven&apos;t submitted any applications yet.
        </p>
        <button
          onClick={goApply}
          className="mt-4 text-[#005ea2] font-bold hover:underline"
        >
          Browse Open Events →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {sponsors.map((app) => (
        <ApplicationCard
          key={`s-${app.id}`}
          app={app}
          kind="sponsor"
          onRefresh={onRefresh}
        />
      ))}
      {vendors.map((app) => (
        <ApplicationCard
          key={`v-${app.id}`}
          app={app}
          kind="vendor"
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "approved"
      ? "bg-[#e4f2e7] text-[#00a91c] border-[#bbf7d0]"
      : status === "paid"
        ? "bg-[#005ea2] text-white border-[#005ea2]"
        : status === "cancelled"
          ? "bg-gray-100 text-gray-400 border-gray-200"
          : "bg-[#fff3d4] text-[#a57914] border-[#fde047]";
  return (
    <span
      className={`px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wider shadow-sm border ${cls}`}
    >
      {status}
    </span>
  );
}

function ApplicationCard({
  app,
  kind,
  onRefresh,
}: {
  app: any;
  kind: Kind;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const isSponsor = kind === "sponsor";
  const tier = isSponsor ? app.sponsorship_tiers?.name : app.vendor_tiers?.name;
  const displayName = isSponsor ? app.company_name : app.business_name;

  const [form, setForm] = useState({
    business_name: displayName || "",
    contact_name: app.contact_name || "",
    application_notes: app.application_notes || "",
    logo_url: app.logo_url || "",
    photo_urls: Array.isArray(app.photo_urls)
      ? app.photo_urls.join(", ")
      : app.photo_urls || "",
  });

  const canEdit = app.status !== "cancelled";
  const canCancel = app.status === "pending";

  const doSave = useServerFn(updateApplication);
  const doCancel = useServerFn(cancelApplication);

  const handleSave = async () => {
    setEditLoading(true);
    try {
      await doSave({
        data: {
          id: app.id,
          kind,
          business_name: form.business_name,
          contact_name: form.contact_name,
          logo_url: form.logo_url || null,
          application_notes: form.application_notes || null,
          photo_urls: form.photo_urls
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      setEditing(false);
      onRefresh();
    } catch (e: any) {
      alert("Error saving changes: " + e.message);
    }
    setEditLoading(false);
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    try {
      await doCancel({ data: { id: app.id, kind } });
      setConfirmCancel(false);
      onRefresh();
    } catch (e: any) {
      alert("Error cancelling: " + e.message);
    }
    setCancelLoading(false);
  };

  const wrapperCls = isSponsor
    ? `bg-[#fffdf5] rounded-xl shadow-sm border overflow-hidden transition-all ${
        app.status === "cancelled"
          ? "border-gray-200 opacity-60 bg-white"
          : "border-[#e8c872]"
      }`
    : `bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${
        app.status === "cancelled"
          ? "border-gray-200 opacity-60"
          : "border-gray-200"
      }`;

  return (
    <div className={wrapperCls}>
      <div
        className={`p-6 flex flex-col md:flex-row justify-between md:items-start gap-4 border-b ${
          isSponsor ? "border-[#fde68a]/30" : "border-gray-100 bg-gray-50/50"
        }`}
      >
        <div className="flex-1">
          <span
            className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded border mb-2 inline-block ${
              isSponsor
                ? "text-[#a57914] bg-[#fef3c7] border-[#fde68a]"
                : "text-gray-500 bg-gray-200 border-gray-300"
            }`}
          >
            {isSponsor ? "Sponsorship Package" : "Vendor Booth"}
          </span>
          <h2 className="text-2xl font-bold text-[#112e51] mb-1">
            {app.sessions?.title}
          </h2>
          <p className="text-sm text-gray-600 font-bold mb-1">
            {tier || (isSponsor ? "Custom" : "Standard Tier")}
          </p>
          {app.sessions?.start_time && (
            <p className="text-sm text-gray-500">
              {new Date(app.sessions.start_time).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-3">
          <StatusBadge status={app.status} />
          {app.status !== "cancelled" && (
            <div className="flex gap-2">
              {canEdit && !editing && (
                <button
                  onClick={() => {
                    setEditing(true);
                    setConfirmCancel(false);
                  }}
                  className={`text-xs font-bold border px-3 py-1.5 rounded transition-colors ${
                    isSponsor
                      ? "text-[#a57914] border-[#a57914] hover:bg-[#a57914] hover:text-white"
                      : "text-[#005ea2] border-[#005ea2] hover:bg-[#005ea2] hover:text-white"
                  }`}
                >
                  Edit
                </button>
              )}
              {canCancel && !confirmCancel && !editing && (
                <button
                  onClick={() => {
                    setConfirmCancel(true);
                    setEditing(false);
                  }}
                  className="text-xs font-bold text-red-600 border border-red-300 px-3 py-1.5 rounded hover:bg-red-50 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmCancel && (
        <div className="p-5 border-b border-red-100 bg-red-50">
          <p className="text-sm font-bold text-red-700 mb-3">
            Are you sure you want to cancel this application? This cannot be
            undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              disabled={cancelLoading}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded transition-colors"
            >
              {cancelLoading ? "Cancelling…" : "Yes, Cancel Application"}
            </button>
            <button
              onClick={() => setConfirmCancel(false)}
              className="bg-white border border-gray-300 text-gray-700 text-sm font-bold px-4 py-2 rounded hover:bg-gray-50 transition-colors"
            >
              Keep Application
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div
          className={`p-6 ${
            isSponsor ? "bg-[#fffcf2]" : "bg-[#f0f6ff] border-b border-blue-100"
          }`}
        >
          <h3
            className={`text-sm font-black uppercase tracking-wider mb-4 ${
              isSponsor ? "text-[#a57914]" : "text-[#112e51]"
            }`}
          >
            {isSponsor ? "Edit Sponsorship details" : "Edit Application"}
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label={isSponsor ? "Company Name" : "Business Name"}>
                <input
                  value={form.business_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, business_name: e.target.value }))
                  }
                  className="w-full p-2.5 border border-gray-300 rounded text-sm bg-white outline-none focus:ring-2 focus:ring-[#005ea2]"
                />
              </Field>
              <Field label="Contact Name">
                <input
                  value={form.contact_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contact_name: e.target.value }))
                  }
                  className="w-full p-2.5 border border-gray-300 rounded text-sm bg-white outline-none focus:ring-2 focus:ring-[#005ea2]"
                />
              </Field>
            </div>
            <Field label="Logo URL">
              <input
                value={form.logo_url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, logo_url: e.target.value }))
                }
                placeholder="https://yourwebsite.com/logo.png"
                className="w-full p-2.5 border border-gray-300 rounded text-sm bg-white outline-none focus:ring-2 focus:ring-[#005ea2]"
              />
            </Field>

            {!isSponsor && (
              <>
                <Field
                  label={
                    <>
                      Photo URLs{" "}
                      <span className="font-normal text-gray-500">
                        (comma-separated)
                      </span>
                    </>
                  }
                >
                  <textarea
                    value={form.photo_urls}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, photo_urls: e.target.value }))
                    }
                    rows={3}
                    placeholder="https://example.com/photo1.jpg, https://example.com/photo2.jpg"
                    className="w-full p-2.5 border border-gray-300 rounded text-sm bg-white outline-none focus:ring-2 focus:ring-[#005ea2] resize-none"
                  />
                  {form.photo_urls && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {form.photo_urls
                        .split(",")
                        .map((u) => u.trim())
                        .filter(Boolean)
                        .map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt={`Photo ${i + 1}`}
                            className="w-16 h-16 object-cover rounded border border-gray-200"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        ))}
                    </div>
                  )}
                </Field>
                <Field label="Proposed Goods / Services">
                  <textarea
                    value={form.application_notes}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        application_notes: e.target.value,
                      }))
                    }
                    rows={3}
                    className="w-full p-2.5 border border-gray-300 rounded text-sm bg-white outline-none focus:ring-2 focus:ring-[#005ea2] resize-none"
                  />
                </Field>
              </>
            )}

            {(app.status === "approved" || app.status === "paid") && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 font-medium">
                Your {isSponsor ? "sponsorship" : "application"} is already
                approved. You can still update contact info and visuals, but
                core details are locked.
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSave}
                disabled={editLoading}
                className={`text-white text-sm font-bold px-5 py-2 rounded transition-colors ${
                  isSponsor
                    ? "bg-[#a57914] hover:bg-[#825e0e]"
                    : "bg-[#005ea2] hover:bg-[#1a4480]"
                }`}
              >
                {editLoading ? "Saving…" : "Save Changes"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="bg-white border border-gray-300 text-gray-700 text-sm font-bold px-4 py-2 rounded hover:bg-gray-50 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {!isSponsor &&
        (app.status === "approved" || app.status === "paid") &&
        app.sessions?.interactive_map_data && (
          <div className="p-6">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
              Load-In Logistics & Floorplan
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Your designated booth location is shown on the map below.
            </p>
            <Suspense
              fallback={
                <div className="text-sm text-gray-500">Loading map…</div>
              }
            >
              <RobustMap
                session={app.sessions}
                availableVendors={[]}
                onSave={() => {}}
                readOnly
              />
            </Suspense>
          </div>
        )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-700 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Apply tab ────────────────────────────────────────────────────────
function ApplyTab({
  user,
  onSubmitted,
}: {
  user: any;
  onSubmitted: () => void;
}) {
  const [appType, setAppType] = useState<Kind>("vendor");
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchSessions = useServerFn(listOpenSessions);
  const fetchTiers = useServerFn(listTiers);
  const doSubmit = useServerFn(submitApplication);

  const { data: sessions } = useQuery({
    queryKey: ["vendor-portal", "open-sessions"],
    queryFn: () => fetchSessions(),
  });
  const { data: tiers } = useQuery({
    queryKey: ["vendor-portal", "tiers", sessionId, appType],
    queryFn: () => fetchTiers({ data: { sessionId, kind: appType } }),
    enabled: !!sessionId,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!sessionId) return;
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      await doSubmit({
        data: {
          kind: appType,
          sessionId,
          tierId: String(fd.get("tierId") || ""),
          companyName: String(fd.get("companyName") || ""),
          contactName: String(fd.get("contactName") || ""),
          logoUrl: (fd.get("logoUrl") as string) || null,
          notes: (fd.get("notes") as string) || null,
        },
      });
      alert(
        "Application submitted successfully! Our team will review it shortly.",
      );
      onSubmitted();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
    setLoading(false);
  };

  const tierList = tiers ?? [];
  const sessionList = sessions ?? [];

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 max-w-2xl">
      <h2 className="text-2xl font-bold text-[#112e51] mb-6">
        Submit Application
      </h2>

      <div className="flex gap-4 mb-6 bg-gray-50 p-2 rounded-lg border border-gray-200">
        <button
          onClick={() => {
            setAppType("vendor");
            setSessionId("");
          }}
          className={`flex-1 py-2 rounded text-sm font-bold transition-all ${
            appType === "vendor"
              ? "bg-white shadow border border-gray-200 text-[#112e51]"
              : "text-gray-500 hover:text-[#112e51]"
          }`}
        >
          Vendor Booth
        </button>
        <button
          onClick={() => {
            setAppType("sponsor");
            setSessionId("");
          }}
          className={`flex-1 py-2 rounded text-sm font-bold transition-all ${
            appType === "sponsor"
              ? "bg-[#fffdf5] shadow border border-[#e8c872] text-[#a57914]"
              : "text-gray-500 hover:text-[#a57914]"
          }`}
        >
          Event Sponsorship
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">
            Select Event *
          </label>
          <select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded bg-gray-50 focus:bg-white focus:ring-2 focus:ring-[#005ea2] outline-none transition-colors"
            required
          >
            <option value="">-- Choose an upcoming event --</option>
            {sessionList.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.title} ({new Date(s.start_time).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>

        {sessionId && tierList.length > 0 && (
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">
              Select {appType === "vendor" ? "Booth" : "Sponsorship"} Tier *
            </label>
            <div className="space-y-2">
              {tierList.map((tier: any) => (
                <label
                  key={tier.id}
                  className={`flex flex-col p-4 border-2 rounded-lg cursor-pointer transition-colors hover:border-gray-300 ${
                    appType === "sponsor" ? "hover:border-[#e8c872]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="tierId"
                        value={tier.id}
                        className={`w-4 h-4 ${
                          appType === "sponsor"
                            ? "text-[#a57914] focus:ring-[#a57914]"
                            : "text-[#005ea2] focus:ring-[#005ea2]"
                        }`}
                        required
                      />
                      <span className="font-bold text-[#112e51]">
                        {tier.name}
                      </span>
                    </div>
                    <span
                      className={`font-black ${
                        appType === "sponsor"
                          ? "text-[#a57914]"
                          : "text-[#00a91c]"
                      }`}
                    >
                      ${tier.price}
                    </span>
                  </div>
                  {tier.perks_description && (
                    <p className="text-xs text-gray-600 ml-7">
                      {tier.perks_description}
                    </p>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {sessionId && tierList.length === 0 && (
          <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded text-sm font-bold">
            No {appType} tiers are currently available for this event.
          </div>
        )}

        {sessionId && tierList.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Company / Business Name *
                </label>
                <input
                  name="companyName"
                  className="w-full p-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#005ea2] outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Contact Name *
                </label>
                <input
                  name="contactName"
                  className="w-full p-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#005ea2] outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                {appType === "sponsor" ? "Company" : "Business"} Logo URL
                (Optional)
              </label>
              <input
                name="logoUrl"
                placeholder="https://yourwebsite.com/logo.png"
                className="w-full p-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#005ea2] outline-none"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Provide a link to a high-res PNG or JPG logo for the public
                directory and marketing materials.
              </p>
            </div>

            {appType === "vendor" && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Proposed Goods / Services *
                </label>
                <textarea
                  name="notes"
                  rows={3}
                  placeholder="Describe what you plan to sell or display..."
                  className="w-full p-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#005ea2] outline-none resize-none"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full text-white font-bold py-4 rounded transition-colors shadow-md text-lg mt-4 ${
                appType === "sponsor"
                  ? "bg-[#a57914] hover:bg-[#825e0e]"
                  : "bg-[#00a91c] hover:bg-green-700"
              }`}
            >
              {loading
                ? "Submitting…"
                : `Submit ${
                    appType === "sponsor" ? "Sponsorship" : "Vendor"
                  } Application`}
            </button>
          </>
        )}
      </form>

      <p className="text-xs text-gray-400 mt-4">Signed in as {user.email}</p>
    </div>
  );
}
