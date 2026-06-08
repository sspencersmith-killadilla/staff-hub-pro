import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, MapPin, Mail, ExternalLink, UserPlus, X, Link2, Trash2,
  Building2, Wrench, DollarSign, Copy,
} from "lucide-react";
import { toast } from "sonner";
import {
  getTicketDetail,
  addTicketUpdate,
  type TicketRow,
  listTicketAssignees,
  listAssignableStaff,
  assignTicket,
  unassignTicket,
  listTicketDepartments,
  setTicketDepartments,
  listDepartmentsForStaff,
  findPossibleDuplicates,
  linkDuplicate,
  unlinkDuplicate,
  listTicketCosts,
  addTicketCost,
  deleteTicketCost,
} from "@/lib/tickets.functions";
import {
  suggestAssetsForTicket,
  linkAssetToTicket,
  upsertAsset,
} from "@/lib/assets.functions";
import { PizzaTracker } from "./PizzaTracker";

const STATUS_OPTIONS = [
  { value: "submitted", label: "Submitted" },
  { value: "received", label: "Received" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
] as const;

export function TicketDetailDrawer({
  ticketId,
  open,
  onOpenChange,
}: {
  ticketId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getTicketDetail);
  const submitUpdate = useServerFn(addTicketUpdate);

  const { data, isLoading } = useQuery({
    queryKey: ["ticket-detail", ticketId],
    queryFn: () => fetchDetail({ data: { id: ticketId! } }),
    enabled: !!ticketId && open,
  });

  const [statusChange, setStatusChange] = useState<string>("");
  const [publicNote, setPublicNote] = useState("");
  const [internalNote, setInternalNote] = useState("");

  useEffect(() => {
    setStatusChange("");
    setPublicNote("");
    setInternalNote("");
  }, [ticketId]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!ticketId) return;
      await submitUpdate({
        data: {
          ticket_id: ticketId,
          status_change: (statusChange || null) as any,
          public_note: publicNote || null,
          internal_note: internalNote || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Update posted");
      setStatusChange("");
      setPublicNote("");
      setInternalNote("");
      qc.invalidateQueries({ queryKey: ["ticket-detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["dispatch-tickets"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to post update"),
  });

  const t: TicketRow | undefined = data?.ticket as any;
  const requesterEmail = data?.requester_email;

  const mapsUrl =
    t?.latitude != null && t?.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${t.latitude},${t.longitude}`
      : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            {t?.category?.name ?? "Ticket"}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              #{t?.id?.slice(0, 8)}
            </span>
          </SheetTitle>
        </SheetHeader>

        {isLoading || !t ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {t.photo_url && (
              <img
                src={t.photo_url}
                alt=""
                className="w-full rounded-lg border object-cover"
              />
            )}

            <div className="space-y-1 text-sm">
              <p className="whitespace-pre-wrap">{t.description}</p>
              <p className="pt-2 text-xs text-muted-foreground">
                Submitted {new Date(t.created_at).toLocaleString()}
              </p>
            </div>

            <div className="rounded-lg border bg-slate-50 p-3">
              <PizzaTracker status={t.status} />
            </div>

            {(t.location_address || mapsUrl) && (
              <div className="rounded-lg border p-3">
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <div className="flex-1">
                    {t.location_address && <div>{t.location_address}</div>}
                    {t.latitude != null && t.longitude != null && (
                      <div className="text-xs text-muted-foreground">
                        {t.latitude.toFixed(5)}, {t.longitude.toFixed(5)}
                      </div>
                    )}
                  </div>
                  {mapsUrl && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-amber-700 hover:underline"
                    >
                      Open in Maps <ExternalLink className="inline h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {requesterEmail && (
              <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a
                  href={`mailto:${requesterEmail}`}
                  className="text-amber-700 hover:underline"
                >
                  {requesterEmail}
                </a>
              </div>
            )}

            <Tabs defaultValue="activity">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="assign"><UserPlus className="h-3.5 w-3.5" /></TabsTrigger>
                <TabsTrigger value="depts"><Building2 className="h-3.5 w-3.5" /></TabsTrigger>
                <TabsTrigger value="dupes"><Copy className="h-3.5 w-3.5" /></TabsTrigger>
                <TabsTrigger value="asset"><Wrench className="h-3.5 w-3.5" /></TabsTrigger>
                <TabsTrigger value="costs"><DollarSign className="h-3.5 w-3.5" /></TabsTrigger>
              </TabsList>

              <TabsContent value="activity" className="mt-3 space-y-3">
                <ActivityList updates={data?.updates ?? []} />
                <PostUpdate
                  statusChange={statusChange}
                  setStatusChange={setStatusChange}
                  publicNote={publicNote}
                  setPublicNote={setPublicNote}
                  internalNote={internalNote}
                  setInternalNote={setInternalNote}
                  onSubmit={() => mutation.mutate()}
                  isPending={mutation.isPending}
                />
              </TabsContent>

              <TabsContent value="assign" className="mt-3">
                <AssigneesTab ticketId={t.id} />
              </TabsContent>

              <TabsContent value="depts" className="mt-3">
                <DepartmentsTab ticketId={t.id} />
              </TabsContent>

              <TabsContent value="dupes" className="mt-3">
                <DuplicatesTab ticketId={t.id} />
              </TabsContent>

              <TabsContent value="asset" className="mt-3">
                <AssetTab ticket={t} />
              </TabsContent>

              <TabsContent value="costs" className="mt-3">
                <CostsTab ticketId={t.id} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// -------- Activity list & post update --------
function ActivityList({ updates }: { updates: any[] }) {
  return (
    <div className="rounded-lg border">
      <div className="border-b bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
        Activity
      </div>
      <ul className="divide-y">
        {updates.length === 0 ? (
          <li className="px-3 py-4 text-sm text-muted-foreground">No updates yet.</li>
        ) : (
          updates.map((u: any) => (
            <li key={u.id} className="px-3 py-3 text-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {new Date(u.created_at).toLocaleString()}
                {u.status_change && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                    → {u.status_change.replace("_", " ")}
                  </span>
                )}
              </div>
              {u.public_note && <p className="mt-1 whitespace-pre-wrap">{u.public_note}</p>}
              {u.internal_note && (
                <p className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs italic text-slate-600">
                  🔒 internal: {u.internal_note}
                </p>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function PostUpdate(props: {
  statusChange: string; setStatusChange: (v: string) => void;
  publicNote: string; setPublicNote: (v: string) => void;
  internalNote: string; setInternalNote: (v: string) => void;
  onSubmit: () => void; isPending: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
      <h3 className="text-sm font-black uppercase tracking-wider text-amber-900">Post an update</h3>
      <div className="space-y-2">
        <Label>Change status</Label>
        <Select value={props.statusChange} onValueChange={props.setStatusChange}>
          <SelectTrigger className="bg-white"><SelectValue placeholder="No change" /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Public note (visible to the citizen)</Label>
        <Textarea rows={3} value={props.publicNote} onChange={(e) => props.setPublicNote(e.target.value)} className="bg-white" />
      </div>
      <div className="space-y-2">
        <Label>Internal note (staff only)</Label>
        <Textarea rows={2} value={props.internalNote} onChange={(e) => props.setInternalNote(e.target.value)} className="bg-white" />
      </div>
      <div className="flex justify-end">
        <Button onClick={props.onSubmit} disabled={props.isPending}>
          {props.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Post update
        </Button>
      </div>
    </div>
  );
}

// -------- Assignees tab --------
function AssigneesTab({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const fetchAssignees = useServerFn(listTicketAssignees);
  const fetchStaff = useServerFn(listAssignableStaff);
  const doAssign = useServerFn(assignTicket);
  const doUnassign = useServerFn(unassignTicket);

  const { data: assignees } = useQuery({
    queryKey: ["ticket-assignees", ticketId],
    queryFn: () => fetchAssignees({ data: { ticket_id: ticketId } }),
  });
  const { data: staffList } = useQuery({
    queryKey: ["assignable-staff"],
    queryFn: () => fetchStaff(),
  });
  const [picked, setPicked] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ticket-assignees", ticketId] });

  return (
    <div className="space-y-3">
      <div className="rounded-lg border">
        <div className="border-b bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
          Assigned to
        </div>
        <ul className="divide-y">
          {(assignees ?? []).length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted-foreground">Nobody assigned yet.</li>
          ) : (
            (assignees ?? []).map((a: any) => (
              <li key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{a.full_name ?? a.email ?? a.invited_email}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.email ?? a.invited_email}
                    {!a.staff_user_id && a.invited_email && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">invited</span>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={async () => {
                  await doUnassign({ data: { id: a.id } });
                  invalidate();
                }}><X className="h-4 w-4" /></Button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <Label>Assign existing staff</Label>
        <div className="flex gap-2">
          <Select value={picked} onValueChange={setPicked}>
            <SelectTrigger><SelectValue placeholder="Pick a staff member" /></SelectTrigger>
            <SelectContent>
              {(staffList ?? []).map((s: any) => (
                <SelectItem key={s.user_id} value={s.user_id}>
                  {s.full_name ? `${s.full_name} · ${s.email}` : s.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={!picked} onClick={async () => {
            await doAssign({ data: { ticket_id: ticketId, staff_user_id: picked } });
            setPicked(""); invalidate();
            toast.success("Assigned");
          }}>Assign</Button>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <Label>Invite by email</Label>
        <div className="flex gap-2">
          <Input type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button disabled={!email} onClick={async () => {
            try {
              await doAssign({ data: { ticket_id: ticketId, email } });
              toast.success("Invitation sent");
              setEmail(""); invalidate();
            } catch (e: any) { toast.error(e.message); }
          }}>Invite</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          If they're already a user we'll link them directly. Otherwise they'll claim the assignment when they sign in.
        </p>
      </div>
    </div>
  );
}

// -------- Departments tab --------
function DepartmentsTab({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const fetchAssigned = useServerFn(listTicketDepartments);
  const fetchAll = useServerFn(listDepartmentsForStaff);
  const save = useServerFn(setTicketDepartments);

  const { data: current } = useQuery({
    queryKey: ["ticket-depts", ticketId],
    queryFn: () => fetchAssigned({ data: { ticket_id: ticketId } }),
  });
  const { data: all } = useQuery({
    queryKey: ["depts-for-staff"], queryFn: () => fetchAll(),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [primary, setPrimary] = useState<string>("");
  useEffect(() => {
    if (!current) return;
    setSelected(new Set(current.map((c: any) => c.department_id)));
    setPrimary(current.find((c: any) => c.is_primary)?.department_id ?? current[0]?.department_id ?? "");
  }, [current]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
    if (!next.has(primary)) setPrimary(Array.from(next)[0] ?? "");
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-3">
        <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Departments</div>
        <ul className="space-y-1.5">
          {(all ?? []).map((d: any) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox" checked={selected.has(d.id)}
                onChange={() => toggle(d.id)}
                className="h-4 w-4"
              />
              <span className="flex-1">{d.name}</span>
              {selected.has(d.id) && (
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="radio" name="primary-dept"
                    checked={primary === d.id} onChange={() => setPrimary(d.id)}
                  />
                  primary
                </label>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-end">
        <Button
          disabled={selected.size === 0 || !primary}
          onClick={async () => {
            try {
              await save({ data: {
                ticket_id: ticketId,
                department_ids: Array.from(selected),
                primary_department_id: primary,
              } });
              toast.success("Departments updated");
              qc.invalidateQueries({ queryKey: ["ticket-depts", ticketId] });
              qc.invalidateQueries({ queryKey: ["dispatch-tickets"] });
            } catch (e: any) { toast.error(e.message); }
          }}
        >Save departments</Button>
      </div>
    </div>
  );
}

// -------- Duplicates tab --------
function DuplicatesTab({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const find = useServerFn(findPossibleDuplicates);
  const link = useServerFn(linkDuplicate);
  const unlink = useServerFn(unlinkDuplicate);

  const { data } = useQuery({
    queryKey: ["dupes", ticketId],
    queryFn: () => find({ data: { ticket_id: ticketId } }),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["dupes", ticketId] });

  return (
    <div className="space-y-3">
      <div className="rounded-lg border">
        <div className="border-b bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
          Linked duplicates
        </div>
        {(data?.links ?? []).length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">No links yet.</p>
        ) : (
          <ul className="divide-y">
            {(data?.links ?? []).map((l: any) => {
              const isPrimary = l.primary_ticket_id === ticketId;
              const other = isPrimary ? l.duplicate_ticket_id : l.primary_ticket_id;
              return (
                <li key={l.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <Badge variant="outline">{isPrimary ? "primary of" : "duplicate of"}</Badge>
                    <span className="ml-2 font-mono text-xs">#{String(other).slice(0, 8)}</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    await unlink({ data: { id: l.id } }); invalidate();
                  }}><Trash2 className="h-4 w-4" /></Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-lg border">
        <div className="border-b bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
          Possible duplicates
        </div>
        {(data?.candidates ?? []).length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">No nearby matches found.</p>
        ) : (
          <ul className="divide-y">
            {(data?.candidates ?? []).map((c: any) => (
              <li key={c.id} className="flex items-start gap-3 px-3 py-3 text-sm">
                {c.photo_url && <img src={c.photo_url} alt="" className="h-14 w-14 rounded object-cover" />}
                <div className="flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    {c.category?.name ?? "Issue"}{c.distance_m != null && <span className="ml-2 text-slate-500">~{c.distance_m}m</span>}
                  </div>
                  <p className="line-clamp-2">{c.description}</p>
                  <div className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString()}</div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="outline" onClick={async () => {
                    try {
                      await link({ data: { primary_ticket_id: c.id, duplicate_ticket_id: ticketId } });
                      toast.success("Linked as duplicate"); invalidate();
                    } catch (e: any) { toast.error(e.message); }
                  }}><Link2 className="mr-1 h-3 w-3" />Is duplicate of</Button>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    try {
                      await link({ data: { primary_ticket_id: ticketId, duplicate_ticket_id: c.id } });
                      toast.success("Linked"); invalidate();
                    } catch (e: any) { toast.error(e.message); }
                  }}>Mark mine primary</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// -------- Asset tab --------
function AssetTab({ ticket }: { ticket: TicketRow & { asset_id?: string | null } }) {
  const qc = useQueryClient();
  const suggest = useServerFn(suggestAssetsForTicket);
  const link = useServerFn(linkAssetToTicket);
  const upsert = useServerFn(upsertAsset);

  const { data: suggestions } = useQuery({
    queryKey: ["asset-suggest", ticket.id],
    queryFn: () => suggest({ data: {
      latitude: ticket.latitude!, longitude: ticket.longitude!, limit: 5,
    } }),
    enabled: ticket.latitude != null && ticket.longitude != null,
  });

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("other");

  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-3 text-sm">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Linked asset</div>
        {ticket.asset_id ? (
          <div className="mt-1 flex items-center justify-between">
            <span className="font-mono text-xs">#{ticket.asset_id.slice(0, 8)}</span>
            <Button size="sm" variant="ghost" onClick={async () => {
              await link({ data: { ticket_id: ticket.id, asset_id: null } });
              toast.success("Unlinked");
              qc.invalidateQueries({ queryKey: ["ticket-detail", ticket.id] });
            }}>Unlink</Button>
          </div>
        ) : <p className="mt-1 text-muted-foreground">No asset linked.</p>}
      </div>

      {ticket.latitude != null && (
        <div className="rounded-lg border">
          <div className="border-b bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            Nearby assets
          </div>
          {(suggestions ?? []).length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">None within ~500m.</p>
          ) : (
            <ul className="divide-y">
              {(suggestions ?? []).map((a: any) => (
                <li key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.asset_type} · ~{a.distance_m}m</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={async () => {
                    await link({ data: { ticket_id: ticket.id, asset_id: a.id } });
                    toast.success("Linked");
                    qc.invalidateQueries({ queryKey: ["ticket-detail", ticket.id] });
                  }}>Link</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="space-y-2 rounded-lg border p-3">
        <Label>Create new asset at this location</Label>
        <Input placeholder="Name (e.g. Streetlight 5th & Main)" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Select value={newType} onValueChange={setNewType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["streetlight","sign","hydrant","bench","tree","playground","sidewalk","road","park","building","other"].map((t) =>
              <SelectItem key={t} value={t}>{t}</SelectItem>
            )}
          </SelectContent>
        </Select>
        <Button disabled={!newName} onClick={async () => {
          try {
            const res = await upsert({ data: {
              name: newName, asset_type: newType,
              address: ticket.location_address ?? null,
              latitude: ticket.latitude ?? null, longitude: ticket.longitude ?? null,
              department_id: ticket.assigned_department_id ?? null,
            }});
            await link({ data: { ticket_id: ticket.id, asset_id: res.id } });
            toast.success("Asset created & linked");
            setNewName("");
            qc.invalidateQueries({ queryKey: ["ticket-detail", ticket.id] });
            qc.invalidateQueries({ queryKey: ["asset-suggest", ticket.id] });
          } catch (e: any) { toast.error(e.message); }
        }}>Create & link</Button>
      </div>
    </div>
  );
}

// -------- Costs tab --------
function CostsTab({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listTicketCosts);
  const add = useServerFn(addTicketCost);
  const del = useServerFn(deleteTicketCost);

  const { data: costs } = useQuery({
    queryKey: ["ticket-costs", ticketId],
    queryFn: () => list({ data: { ticket_id: ticketId } }),
  });
  const total = useMemo(() => (costs ?? []).reduce((s: number, c: any) => s + Number(c.amount ?? 0), 0), [costs]);

  const [kind, setKind] = useState<"labor"|"materials"|"equipment"|"other">("labor");
  const [desc, setDesc] = useState("");
  const [hours, setHours] = useState("");
  const [rate, setRate] = useState("");
  const [amount, setAmount] = useState("");

  // Auto-compute amount for labor when hours*rate filled
  useEffect(() => {
    if (kind === "labor" && hours && rate) {
      const v = (parseFloat(hours) || 0) * (parseFloat(rate) || 0);
      setAmount(v ? v.toFixed(2) : "");
    }
  }, [kind, hours, rate]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ticket-costs", ticketId] });

  return (
    <div className="space-y-3">
      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cost line items</span>
          <span className="text-sm font-bold text-slate-700">${total.toFixed(2)}</span>
        </div>
        {(costs ?? []).length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">No costs logged.</p>
        ) : (
          <ul className="divide-y">
            {(costs ?? []).map((c: any) => (
              <li key={c.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{c.kind}</Badge>
                    <span className="font-bold">${Number(c.amount).toFixed(2)}</span>
                    {c.hours && <span className="text-xs text-muted-foreground">{c.hours}h × ${c.rate ?? 0}</span>}
                  </div>
                  {c.description && <p className="text-muted-foreground">{c.description}</p>}
                  <div className="text-[10px] text-muted-foreground">{c.incurred_on}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={async () => {
                  await del({ data: { id: c.id } }); invalidate();
                }}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Add line item</div>
        <Select value={kind} onValueChange={(v: any) => setKind(v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["labor","materials","equipment","other"].map((t) =>
              <SelectItem key={t} value={t}>{t}</SelectItem>
            )}
          </SelectContent>
        </Select>
        <Input placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
        {kind === "labor" && (
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Hours" type="number" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} />
            <Input placeholder="Hourly rate" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
        )}
        <Input placeholder="Amount $" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Button disabled={!amount} onClick={async () => {
          try {
            await add({ data: {
              ticket_id: ticketId, kind,
              description: desc || null,
              hours: hours ? parseFloat(hours) : null,
              rate: rate ? parseFloat(rate) : null,
              amount: parseFloat(amount),
            }});
            setDesc(""); setHours(""); setRate(""); setAmount("");
            toast.success("Cost added"); invalidate();
          } catch (e: any) { toast.error(e.message); }
        }}>Add cost</Button>
      </div>
    </div>
  );
}
