import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Facebook,
  Instagram,
  Linkedin,
  Sparkles,
  Twitter,
  ImageIcon,
  Send,
  GripVertical,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { listEvents } from "@/lib/events.functions";
import { listConnections, schedulePost, listPosts } from "@/lib/social.functions";
import { useDepartment } from "@/contexts/department-context";
import { usePermissions } from "@/hooks/use-permissions";
import { Link } from "@tanstack/react-router";
import { Plug } from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff/admin/social")({
  component: SocialCommandCenterGate,
});

function SocialCommandCenterGate() {
  const { can, loading } = usePermissions();
  if (loading) return <div className="p-6 text-sm">Checking permissions…</div>;
  if (!can("page.social_command"))
    return (
      <div className="p-6 text-sm">
        You need the <strong>Social Command Center</strong> permission. Ask an admin
        to grant it in Admin → Permissions.
      </div>
    );
  return <SocialCommandCenter />;
}

type Platform = "facebook" | "instagram" | "linkedin" | "x";

type ScheduledPost = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  caption: string;
  mediaUrl: string | null;
  platforms: Record<Platform, boolean>;
  eventId?: string | null;
  eventTitle?: string | null;
  status?: string;
};

type EventLite = {
  id: string;
  title: string;
  event_type?: string | null;
  start_time?: string | null;
  image_url?: string | null;
  speaker_name?: string | null;
};

const PLATFORM_META: Record<
  Platform,
  { label: string; icon: typeof Facebook; tint: string }
> = {
  facebook: { label: "Facebook", icon: Facebook, tint: "bg-blue-600" },
  instagram: { label: "Instagram", icon: Instagram, tint: "bg-pink-600" },
  linkedin: { label: "LinkedIn", icon: Linkedin, tint: "bg-sky-700" },
  x: { label: "X", icon: Twitter, tint: "bg-black" },
};

const fmtKey = (d: Date) => format(d, "yyyy-MM-dd");

function draftFromEvent(ev: EventLite): string {
  const when = ev.start_time
    ? format(new Date(ev.start_time), "EEEE, MMM d 'at' h:mm a")
    : "Coming soon";
  const guest = ev.speaker_name ? ` Featuring ${ev.speaker_name}.` : "";
  const tag = (ev.event_type ?? "event").toLowerCase().replace(/\s+/g, "");
  return `🎉 Don't miss "${ev.title}" — ${when}.${guest}\n\nJoin us for an unforgettable experience. Tap the link in bio for details.\n\n#${tag} #community #eventslife`;
}

function SocialCommandCenter() {
  const fetchEvents = useServerFn(listEvents);
  const fetchConns = useServerFn(listConnections);
  const fetchPosts = useServerFn(listPosts);
  const schedule = useServerFn(schedulePost);
  const queryClient = useQueryClient();
  const { activeDepartment } = useDepartment();
  const { data: events = [] } = useQuery({
    queryKey: ["social-events"],
    queryFn: () => fetchEvents({ data: { includeAll: true } }),
  });
  const { data: conns = [] } = useQuery({
    queryKey: ["social-connections", activeDepartment?.id],
    queryFn: () => fetchConns({ data: { departmentId: activeDepartment!.id } }),
    enabled: !!activeDepartment?.id,
  });
  const accountByPlatform = useMemo(() => {
    const m: Partial<Record<Platform, string>> = {};
    for (const c of conns) m[c.platform as Platform] = c.account_name;
    return m;
  }, [conns]);

  const postsQueryKey = ["social-posts", activeDepartment?.id] as const;
  const { data: serverPosts = [] } = useQuery({
    queryKey: postsQueryKey,
    queryFn: () => fetchPosts({ data: { departmentId: activeDepartment!.id } }),
    enabled: !!activeDepartment?.id,
  });

  const posts: ScheduledPost[] = useMemo(
    () =>
      (serverPosts as Array<{
        id: string;
        scheduled_for: string;
        caption: string;
        media_url: string | null;
        event_id: string | null;
        platforms: string[];
        status: string;
      }>).map((r) => {
        const d = new Date(r.scheduled_for);
        const plat: Record<Platform, boolean> = {
          facebook: r.platforms.includes("facebook"),
          instagram: r.platforms.includes("instagram"),
          linkedin: r.platforms.includes("linkedin"),
          x: false,
        };
        const ev = (events as EventLite[]).find((e) => e.id === r.event_id);
        return {
          id: r.id,
          date: format(d, "yyyy-MM-dd"),
          time: format(d, "HH:mm"),
          caption: r.caption,
          mediaUrl: r.media_url,
          platforms: plat,
          eventId: r.event_id,
          eventTitle: ev?.title ?? null,
          status: r.status,
        };
      }),
    [serverPosts, events],
  );

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [composer, setComposer] = useState<{
    date: string;
    post?: ScheduledPost;
    seedEvent?: EventLite;
  } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    const out: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [cursor]);

  const upcomingEvents = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return (events as EventLite[])
      .filter((e) => !e.start_time || new Date(e.start_time) >= start)
      .sort((a, b) => {
        if (!a.start_time) return 1;
        if (!b.start_time) return -1;
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      });
  }, [events]);

  const postsByDate = useMemo(() => {
    const m = new Map<string, ScheduledPost[]>();
    for (const p of posts) {
      const arr = m.get(p.date) ?? [];
      arr.push(p);
      m.set(p.date, arr);
    }
    return m;
  }, [posts]);

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const dateKey = String(e.over.id).replace("day-", "");
    const eventId = String(e.active.id).replace("event-", "");
    const ev = (events as EventLite[]).find((x) => x.id === eventId);
    if (!ev) return;
    setComposer({ date: dateKey, seedEvent: ev });
  }

  async function savePost(post: ScheduledPost & { times?: Partial<Record<Platform, string>> }) {
    if (!activeDepartment?.id) {
      toast.error("Select an active department first");
      return;
    }
    const enabled = (Object.entries(post.platforms) as [Platform, boolean][])
      .filter(([k, v]) => v && k !== "x")
      .map(([k]) => k) as ("facebook" | "instagram" | "linkedin")[];
    if (enabled.length === 0) {
      toast.error("Pick at least one connected platform (X must be posted manually).");
      return;
    }
    // Group platforms by their scheduled time so each distinct time becomes one post.
    const groups = new Map<string, ("facebook" | "instagram" | "linkedin")[]>();
    for (const p of enabled) {
      const t = post.times?.[p] || post.time || "12:00";
      const arr = groups.get(t) ?? [];
      arr.push(p);
      groups.set(t, arr);
    }
    try {
      for (const [t, platforms] of groups) {
        await schedule({
          data: {
            departmentId: activeDepartment.id,
            scheduledFor: new Date(`${post.date}T${t}:00`).toISOString(),
            caption: post.caption,
            mediaUrl: post.mediaUrl ?? null,
            eventId: post.eventId ?? null,
            platforms,
          },
        });
      }
      await queryClient.invalidateQueries({ queryKey: postsQueryKey });
      toast.success("Post scheduled", {
        description: Array.from(groups.entries())
          .map(([t, ps]) => `${ps.map((p) => PLATFORM_META[p].label).join(", ")} @ ${t}`)
          .join(" · "),
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="h-7 w-7 text-primary" />
              Social Media Command Center
            </h1>
            <p className="text-muted-foreground">
              Drag events onto a day to schedule omnichannel posts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/staff/admin/social/connections">
                <Plug className="h-4 w-4 mr-1" />
                {conns.length} connected
              </Link>
            </Button>
            <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setCursor(subMonths(cursor, 1))}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <div className="w-44 text-center font-semibold">{format(cursor, "MMMM yyyy")}</div>
            <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setCursor(addMonths(cursor, 1))}>
              <ChevronRight aria-hidden="true" />
            </Button>
            <Button variant="outline" onClick={() => setCursor(startOfMonth(new Date()))}>
              Today
            </Button>
          </div>
        </header>

        {conns.length === 0 && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-4 text-sm text-amber-900">
              No social accounts are connected for{" "}
              <strong>{activeDepartment?.name ?? "this department"}</strong> yet.{" "}
              <Link
                to="/staff/admin/social/connections"
                className="underline font-medium"
              >
                Connect Facebook, Instagram, or LinkedIn →
              </Link>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Event sidebar */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4" /> Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-2">
                <div className="space-y-2">
                  {upcomingEvents.length === 0 && (
                    <p className="text-sm text-muted-foreground">No upcoming events.</p>
                  )}
                  {upcomingEvents.map((ev) => (
                    <DraggableEvent key={ev.id} event={ev} />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Calendar grid */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div
                    key={d}
                    className="bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
                {days.map((d) => {
                  const key = fmtKey(d);
                  return (
                    <DroppableDay
                      key={key}
                      date={d}
                      inMonth={isSameMonth(d, cursor)}
                      posts={postsByDate.get(key) ?? []}
                      onClick={() => setComposer({ date: key })}
                      onEditPost={(post) => setComposer({ date: post.date, post })}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {composer && (
        <ComposerDialog
          open
          onOpenChange={(o) => !o && setComposer(null)}
          dateKey={composer.date}
          existing={composer.post}
          seedEvent={composer.seedEvent}
          eventLibrary={events as EventLite[]}
          accountByPlatform={accountByPlatform}
          departmentName={activeDepartment?.name ?? "Your department"}
          onSave={(p) => {
            savePost(p);
            setComposer(null);
          }}
        />
      )}
    </DndContext>
  );
}

function DraggableEvent({ event }: { event: EventLite }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `event-${event.id}`,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card p-2 cursor-grab active:cursor-grabbing hover:bg-accent transition-colors",
        isDragging && "opacity-50",
      )}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
      {event.image_url ? (
        <img src={event.image_url} alt="" className="h-9 w-9 rounded object-cover" />
      ) : (
        <div className="h-9 w-9 rounded bg-muted grid place-items-center">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{event.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {event.start_time ? format(new Date(event.start_time), "MMM d") : "TBD"}
        </p>
      </div>
    </div>
  );
}

function DroppableDay({
  date,
  inMonth,
  posts,
  onClick,
  onEditPost,
}: {
  date: Date;
  inMonth: boolean;
  posts: ScheduledPost[];
  onClick: () => void;
  onEditPost: (p: ScheduledPost) => void;
}) {
  const key = fmtKey(date);
  const { setNodeRef, isOver } = useDroppable({ id: `day-${key}` });
  const isToday = isSameDay(date, new Date());
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-[110px] bg-background p-2 text-left flex flex-col gap-1 transition-colors hover:bg-accent/40",
        !inMonth && "bg-muted/30 text-muted-foreground",
        isOver && "ring-2 ring-primary ring-inset bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-xs font-semibold",
            isToday &&
              "bg-primary text-primary-foreground rounded-full h-5 w-5 grid place-items-center",
          )}
        >
          {format(date, "d")}
        </span>
      </div>
      <div className="space-y-1">
        {posts.slice(0, 3).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditPost(p);
            }}
            className="block w-full text-left text-[11px] truncate rounded bg-primary/10 text-primary px-1.5 py-0.5 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {p.caption.slice(0, 28) || "Untitled post"}
          </button>
        ))}
        {posts.length > 3 && (
          <div className="text-[10px] text-muted-foreground">+{posts.length - 3} more</div>
        )}
      </div>
    </button>
  );
}

function ComposerDialog({
  open,
  onOpenChange,
  dateKey,
  existing,
  seedEvent,
  eventLibrary,
  accountByPlatform,
  departmentName,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dateKey: string;
  existing?: ScheduledPost;
  seedEvent?: EventLite;
  eventLibrary: EventLite[];
  accountByPlatform: Partial<Record<Platform, string>>;
  departmentName: string;
  onSave: (p: ScheduledPost & { times?: Partial<Record<Platform, string>> }) => void;
}) {
  const [caption, setCaption] = useState(
    existing?.caption ?? (seedEvent ? draftFromEvent(seedEvent) : ""),
  );
  const [time, setTime] = useState(existing?.time ?? "12:00");
  const [perPlatformTime, setPerPlatformTime] = useState(false);
  const [times, setTimes] = useState<Record<Platform, string>>({
    facebook: existing?.time ?? "12:00",
    instagram: existing?.time ?? "12:00",
    linkedin: existing?.time ?? "12:00",
    x: existing?.time ?? "12:00",
  });
  const [mediaUrl, setMediaUrl] = useState<string | null>(
    existing?.mediaUrl ?? seedEvent?.image_url ?? null,
  );
  const [platforms, setPlatforms] = useState<Record<Platform, boolean>>(
    existing?.platforms ?? { facebook: true, instagram: true, linkedin: false, x: true },
  );
  const [linkedEventId, setLinkedEventId] = useState<string | null>(
    existing?.eventId ?? seedEvent?.id ?? null,
  );

  const mediaLibrary = useMemo(
    () => eventLibrary.filter((e) => !!e.image_url).slice(0, 24),
    [eventLibrary],
  );

  function handleDraftFromEvent() {
    const ev = eventLibrary.find((e) => e.id === linkedEventId) ?? seedEvent;
    if (!ev) {
      toast.error("Link an event first", {
        description: "Pick an event from the media picker or drag one onto the calendar.",
      });
      return;
    }
    setCaption(draftFromEvent(ev));
    if (!mediaUrl && ev.image_url) setMediaUrl(ev.image_url);
    toast.success("Caption drafted from event");
  }

  function handleSave() {
    const ev = eventLibrary.find((e) => e.id === linkedEventId);
    onSave({
      id: existing?.id ?? crypto.randomUUID(),
      date: dateKey,
      time,
      caption,
      mediaUrl,
      platforms,
      eventId: linkedEventId,
      eventTitle: ev?.title ?? null,
      times: perPlatformTime ? times : undefined,
    } as ScheduledPost & { times?: Partial<Record<Platform, string>> });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Compose post · {format(new Date(dateKey + "T00:00"), "EEE, MMM d")}</DialogTitle>
          <DialogDescription>
            Write once, publish to every channel. Preview updates live.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Editor */}
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Caption</Label>
                <Button size="sm" variant="secondary" onClick={handleDraftFromEvent}>
                  <Sparkles className="h-3.5 w-3.5" /> Draft from Event
                </Button>
              </div>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={6}
                placeholder="What's happening?"
              />
              <p className="text-xs text-muted-foreground">{caption.length} characters</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Post time</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    id="per-platform-time"
                    checked={perPlatformTime}
                    onCheckedChange={(v) => {
                      setPerPlatformTime(v);
                      if (v) {
                        setTimes((s) => ({
                          facebook: s.facebook || time,
                          instagram: s.instagram || time,
                          linkedin: s.linkedin || time,
                          x: s.x || time,
                        }));
                      }
                    }}
                  />
                  <Label htmlFor="per-platform-time" className="text-xs text-muted-foreground">
                    Per-channel time
                  </Label>
                </div>
              </div>
              {!perPlatformTime && (
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-40"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> Media picker
              </Label>
              <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto p-1 border rounded-md">
                {mediaLibrary.length === 0 && (
                  <p className="col-span-4 text-xs text-muted-foreground p-2">
                    No event images yet. Upload images to events to populate the library.
                  </p>
                )}
                {mediaLibrary.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => {
                      setMediaUrl(ev.image_url!);
                      setLinkedEventId(ev.id);
                    }}
                    className={cn(
                      "aspect-square rounded overflow-hidden border-2 transition-all",
                      mediaUrl === ev.image_url
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-transparent hover:border-muted-foreground/40",
                    )}
                    title={ev.title}
                  >
                    <img src={ev.image_url!} alt={ev.title} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
              {mediaUrl && (
                <Button variant="ghost" size="sm" onClick={() => setMediaUrl(null)}>
                  Clear media
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label>Channels</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PLATFORM_META) as Platform[]).map((p) => {
                  const meta = PLATFORM_META[p];
                  const Icon = meta.icon;
                  return (
                    <div
                      key={p}
                      className="flex items-center justify-between rounded-md border p-2.5 gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={cn("h-7 w-7 rounded grid place-items-center text-white shrink-0", meta.tint)}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-sm font-medium truncate">{meta.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {perPlatformTime && platforms[p] && (
                          <Input
                            type="time"
                            value={times[p]}
                            onChange={(e) =>
                              setTimes((s) => ({ ...s, [p]: e.target.value }))
                            }
                            className="w-28 h-8"
                          />
                        )}
                        <Switch
                          checked={platforms[p]}
                          onCheckedChange={(v) => setPlatforms((s) => ({ ...s, [p]: v }))}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-3">
            <Label>Live preview</Label>
            <ScrollArea className="h-[460px] pr-2">
              <div className="space-y-3">
                {(Object.keys(PLATFORM_META) as Platform[])
                  .filter((p) => platforms[p])
                  .map((p) => (
                    <PreviewCard
                      key={p}
                      platform={p}
                      caption={caption}
                      mediaUrl={mediaUrl}
                      accountName={accountByPlatform[p]}
                      departmentName={departmentName}
                    />
                  ))}
                {Object.values(platforms).every((v) => !v) && (
                  <p className="text-sm text-muted-foreground">
                    Toggle a channel on the left to preview.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <Send className="h-4 w-4" /> Schedule post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewCard({
  platform,
  caption,
  mediaUrl,
  accountName,
  departmentName,
}: {
  platform: Platform;
  caption: string;
  mediaUrl: string | null;
  accountName?: string;
  departmentName: string;
}) {
  const meta = PLATFORM_META[platform];
  const Icon = meta.icon;
  const truncated =
    platform === "x" && caption.length > 280 ? caption.slice(0, 277) + "..." : caption;
  const displayName = accountName ?? `${departmentName} (not connected)`;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b">
        <div className={cn("h-8 w-8 rounded-full grid place-items-center text-white", meta.tint)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{displayName}</p>
          <p className="text-xs text-muted-foreground">{meta.label} · scheduled</p>
        </div>
        <Badge
          variant={accountName ? "outline" : "destructive"}
          className="text-[10px]"
        >
          {accountName ? "Preview" : "No account"}
        </Badge>
      </div>
      {platform === "instagram" && mediaUrl && (
        <img src={mediaUrl} alt="" className="w-full aspect-square object-cover" />
      )}
      <div className="p-3 space-y-2">
        <p className="text-sm whitespace-pre-wrap">{truncated || <span className="text-muted-foreground italic">Your caption will appear here…</span>}</p>
        {platform !== "instagram" && mediaUrl && (
          <img src={mediaUrl} alt="" className="w-full rounded-md object-cover max-h-56" />
        )}
        {platform === "x" && (
          <p className="text-xs text-muted-foreground">{truncated.length}/280</p>
        )}
      </div>
    </div>
  );
}
