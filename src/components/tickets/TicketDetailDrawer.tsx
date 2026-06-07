import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin, Mail, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  getTicketDetail,
  addTicketUpdate,
  type TicketRow,
} from "@/lib/tickets.functions";
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
  const updates = data?.updates ?? [];
  const requesterEmail = data?.requester_email;

  const mapsUrl =
    t?.latitude != null && t?.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${t.latitude},${t.longitude}`
      : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
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
          <div className="mt-4 space-y-5">
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
                {t.department?.name && ` · ${t.department.name}`}
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
                {t.latitude != null && t.longitude != null && (
                  <iframe
                    title="Location"
                    className="mt-3 h-48 w-full rounded border"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps?q=${t.latitude},${t.longitude}&hl=en&z=16&output=embed`}
                  />
                )}
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

            <div className="rounded-lg border">
              <div className="border-b bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                Activity
              </div>
              <ul className="divide-y">
                {updates.length === 0 ? (
                  <li className="px-3 py-4 text-sm text-muted-foreground">
                    No updates yet.
                  </li>
                ) : (
                  updates.map((u) => (
                    <li key={u.id} className="px-3 py-3 text-sm">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {new Date(u.created_at).toLocaleString()}
                        {u.status_change && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                            → {u.status_change.replace("_", " ")}
                          </span>
                        )}
                      </div>
                      {u.public_note && (
                        <p className="mt-1 whitespace-pre-wrap">{u.public_note}</p>
                      )}
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

            <div className="space-y-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-amber-900">
                Post an update
              </h3>
              <div className="space-y-2">
                <Label>Change status</Label>
                <Select value={statusChange} onValueChange={setStatusChange}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="No change" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Public note (visible to the citizen)</Label>
                <Textarea
                  rows={3}
                  value={publicNote}
                  onChange={(e) => setPublicNote(e.target.value)}
                  className="bg-white"
                  placeholder="e.g. Crew is scheduled for Thursday morning."
                />
              </div>
              <div className="space-y-2">
                <Label>Internal note (staff only)</Label>
                <Textarea
                  rows={2}
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  className="bg-white"
                  placeholder="Optional notes for the team"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                  {mutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Post update
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
