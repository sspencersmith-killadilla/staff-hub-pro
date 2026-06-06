import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCampaign,
  saveCampaign,
  dispatchCampaignNow,
  sendTestCampaign,
  previewAudience,
} from "@/lib/campaigns.functions";
import { listEvents, listAssignableDepartments } from "@/lib/events.functions";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send, Save, X, Plus, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/staff/communications/$id")({
  component: EditCampaign,
});

type Segment =
  | { type: "all_active_users" }
  | { type: "event_attendees"; event_id: string }
  | { type: "approved_vendors" }
  | { type: "department_members"; department_id: string };

function EditCampaign() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = Route.useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => getCampaign({ data: { id } }),
  });

  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyJson, setBodyJson] = useState<any>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setSubject(data.subject || "");
    setBodyHtml(data.body_html || "");
    setBodyJson(data.body_json ?? null);
    setSegments((data.target_audience_rules as any)?.segments ?? []);
    setDepartmentId((data as any).department_id ?? null);
    if (data.scheduled_for) {
      setScheduleMode("later");
      const d = new Date(data.scheduled_for);
      const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setScheduledFor(iso);
    }
  }, [data]);


  const { data: events = [] } = useQuery({ queryKey: ["events-list"], queryFn: () => listEvents() });
  const { data: departments = [] } = useQuery({
    queryKey: ["assignable-departments"],
    queryFn: () => listAssignableDepartments(),
  });

  const audience = useQuery({
    queryKey: ["audience-preview", segments],
    queryFn: () => previewAudience({ data: { rules: { segments } } }),
    enabled: segments.length > 0,
  });

  const save = useMutation({
    mutationFn: () =>
      saveCampaign({
        data: {
          id,
          subject,
          body_html: bodyHtml,
          body_json: bodyJson,
          target_audience_rules: { segments },
          department_id: departmentId,
          scheduled_for:
            scheduleMode === "later" && scheduledFor
              ? new Date(scheduledFor).toISOString()
              : null,
        },
      }),

    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["campaign", id] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const dispatch = useMutation({
    mutationFn: async () => {
      await save.mutateAsync();
      return dispatchCampaignNow({ data: { id } });
    },
    onSuccess: (r: any) => {
      toast.success(`Sent to ${r.sent} recipients${r.failed ? ` (${r.failed} failed)` : ""}`);
      navigate({ to: "/staff/communications" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sendTest = useMutation({
    mutationFn: async () => {
      await save.mutateAsync();
      return sendTestCampaign({ data: { id, email: testEmail } });
    },
    onSuccess: () => toast.success(`Test sent to ${testEmail}`),
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  const readOnly = data.status === "sent" || data.status === "sending";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <Link to="/staff/communications" className="text-sm text-muted-foreground hover:underline flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium">Edit campaign</span>
        <Badge className="ml-2">{data.status}</Badge>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <Label>Subject</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={readOnly}
                  placeholder="Email subject line"
                />
              </div>
              <div>
                <Label>Body</Label>
                <RichTextEditor
                  value={bodyHtml}
                  onChange={(html, json) => { setBodyHtml(html); setBodyJson(json); }}
                  minHeight={320}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Audience</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pb-4">
              {segments.map((seg, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm bg-slate-100 rounded px-2 py-1">
                  <span className="flex-1">{describe(seg, events, departments)}</span>
                  <button onClick={() => setSegments(segments.filter((_, i) => i !== idx))} disabled={readOnly}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <AddSegment onAdd={(s) => setSegments([...segments, s])} events={events} departments={departments} disabled={readOnly} />
              <div className="text-xs text-muted-foreground pt-2">
                {segments.length === 0
                  ? "No audience selected"
                  : audience.isLoading
                    ? "Calculating…"
                    : `~${audience.data?.count ?? 0} recipients (unsubscribes excluded)`}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Send</CardTitle></CardHeader>
            <CardContent className="space-y-3 pb-4">
              <Select value={scheduleMode} onValueChange={(v) => setScheduleMode(v as "now" | "later")} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="now">Send now</SelectItem>
                  <SelectItem value="later">Schedule for…</SelectItem>
                </SelectContent>
              </Select>
              {scheduleMode === "later" && (
                <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} disabled={readOnly} />
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending || readOnly}>
                  <Save className="h-4 w-4 mr-1" /> Save
                </Button>
                <Button
                  onClick={() => dispatch.mutate()}
                  disabled={dispatch.isPending || readOnly || segments.length === 0 || !subject}
                >
                  <Send className="h-4 w-4 mr-1" />
                  {scheduleMode === "later" ? "Save schedule" : "Send now"}
                </Button>
              </div>

              <div className="pt-3 border-t">
                <Label className="text-xs">Send test to email</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="email" placeholder="you@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
                  <Button variant="outline" size="sm" onClick={() => sendTest.mutate()} disabled={!testEmail || sendTest.isPending}>
                    <Mail className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function describe(seg: Segment, events: any[], departments: any[]): string {
  if (seg.type === "all_active_users") return "All active users";
  if (seg.type === "approved_vendors") return "Approved vendors";
  if (seg.type === "event_attendees") {
    const e = events.find((x) => x.id === seg.event_id);
    return `Attendees of: ${e?.title ?? seg.event_id}`;
  }
  if (seg.type === "department_members") {
    const d = departments.find((x: any) => x.id === seg.department_id);
    return `Department: ${d?.name ?? seg.department_id}`;
  }
  return "Segment";
}

function AddSegment({
  onAdd,
  events,
  departments,
  disabled,
}: {
  onAdd: (s: Segment) => void;
  events: any[];
  departments: any[];
  disabled?: boolean;
}) {
  const [type, setType] = useState<string>("");
  const [eventId, setEventId] = useState("");
  const [deptId, setDeptId] = useState("");

  function add() {
    if (type === "all_active_users") onAdd({ type: "all_active_users" });
    else if (type === "approved_vendors") onAdd({ type: "approved_vendors" });
    else if (type === "event_attendees" && eventId) onAdd({ type: "event_attendees", event_id: eventId });
    else if (type === "department_members" && deptId) onAdd({ type: "department_members", department_id: deptId });
    setType(""); setEventId(""); setDeptId("");
  }

  return (
    <div className="space-y-2">
      <Select value={type} onValueChange={setType} disabled={disabled}>
        <SelectTrigger className="h-8"><SelectValue placeholder="+ Add audience segment" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all_active_users">All active users</SelectItem>
          <SelectItem value="event_attendees">Event attendees</SelectItem>
          <SelectItem value="approved_vendors">Approved vendors</SelectItem>
          <SelectItem value="department_members">Department members</SelectItem>
        </SelectContent>
      </Select>
      {type === "event_attendees" && (
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger className="h-8"><SelectValue placeholder="Pick event" /></SelectTrigger>
          <SelectContent>
            {events.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {type === "department_members" && (
        <Select value={deptId} onValueChange={setDeptId}>
          <SelectTrigger className="h-8"><SelectValue placeholder="Pick department" /></SelectTrigger>
          <SelectContent>
            {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {type && (
        <Button size="sm" variant="secondary" onClick={add} disabled={disabled} className="w-full">
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      )}
    </div>
  );
}
