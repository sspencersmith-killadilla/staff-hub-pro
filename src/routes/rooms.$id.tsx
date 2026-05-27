import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Users, Building2, MapPin, Share2, Clock, Info, Check } from "lucide-react";
import { useState, useMemo } from "react";
import { getRoomPublic } from "@/lib/venues-public.functions";
import { SiteHeader } from "@/components/site-header";
import { RoomReservationForm } from "@/components/room-reservation-form";
import { requireModule } from "@/lib/require-module";

const roomQO = (id: string) =>
  queryOptions({
    queryKey: ["public", "room", id],
    queryFn: () => getRoomPublic({ data: { id } }),
  });

export const Route = createFileRoute("/rooms/$id")({
  beforeLoad: () => requireModule("room_reservations"),
  loader: ({ params, context }) => context.queryClient.ensureQueryData(roomQO(params.id)),
  component: RoomDetail,
});

function formatHour(h: number) {
  const ampm = h >= 12? "PM" : "AM";
  const h12 = h % 12 === 0? 12 : h % 12;
  return `${h12}:00 ${ampm}`;
}

function RoomDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(roomQO(id));
  const r: any = data.room;
  const v: any = data.venue;

  const [selectedHour][setSelectedHour] = useState<number | null>(null);
  const [copied][setCopied] = useState(false);

  // Build hours from venue open_hours if you have them, else default 7am-8pm
  const { startHour, endHour } = useMemo(() => {
    // v?.open_hours could be { open: 8, close: 20 } — adapt to your shape
    return { startHour: v?.open_hours?.open?? 7, endHour: v?.open_hours?.close?? 20 };
  }, [v]);

  const hours = useMemo(() =>
    Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour][endHour]
  );

  const selectedEnd = selectedHour!== null? selectedHour + 2 : null;

  const handleShare = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">

        {/* Image header - pulls from r.image_url */}
        {r.image_url && (
          <div className="relative h-64 md:h-80 w-full overflow-hidden rounded-2xl mb-8">
            <img src={r.image_url} alt={r.name} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-white">{r.name}</h1>
                <p className="mt-1 text-white/80 flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" /> {v?.name}{r.building? ` • ${r.building}` : ""}
                </p>
              </div>
              <button onClick={handleShare} className="rounded-lg bg-white/20 backdrop-blur px-3 py-1.5 text-sm text-white hover:bg-white/30">
                {copied? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1fr_380px] items-start">
          {/* Left */}
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {r.capacity && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white border px-3 py-1.5 text-sm">
                  <Users className="h-4 w-4" /> Up to {r.capacity}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white border px-3 py-1.5 text-sm">
                <Clock className="h-4 w-4" /> 2-hour blocks
              </span>
            </div>

            {r.description && (
              <section className="rounded-2xl bg-white border p-6">
                <h2 className="text-lg font-semibold mb-3">About this room</h2>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{r.description}</p>
              </section>
            )}
          </div>

          {/* Right - Time slot picker replaces calendar + hours */}
          <aside className="lg:sticky lg:top-24">
            <div className="rounded-2xl bg-white border shadow-sm">
              <div className="p-6 border-b">
                <h2 className="text-lg font-semibold">Pick a time slot</h2>
                <p className="text-sm text-gray-600 mt-1">Select a start time. We automatically reserve the next hour.</p>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-3 gap-2">
                  {hours.map((h) => {
                    const isStart = selectedHour === h;
                    const isNext = selectedHour!== null && h === selectedHour + 1;
                    const isSelected = isStart || isNext;
                    const disabled = h > endHour - 2; // can't start at last hour

                    return (
                      <button
                        key={h}
                        disabled={disabled}
                        onClick={() => setSelectedHour(h)}
                        className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition
                          ${disabled? "opacity-40 cursor-not-allowed bg-gray-50" : "hover:bg-gray-50"}
                          ${isStart? "bg-gray-900 text-white border-gray-900" : ""}
                          ${isNext? "bg-gray-900/10 text-gray-900 border-gray-900/30" : ""}
                          ${!isSelected &&!disabled? "bg-white border-gray-300 text-gray-700" : ""}
                        `}
                        aria-pressed={isStart}
                      >
                        {formatHour(h)}
                      </button>
                    );
                  })}
                </div>

                {selectedHour!== null && (
                  <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
                    Selected: {formatHour(selectedHour)} – {formatHour(selectedEnd!)}
                  </div>
                )}

                <div className="mt-6">
                  {/* Your existing form — it will receive the times */}
                  <RoomReservationForm
                    roomId={String(r.id)}
                    openHours={v?.open_hours}
                    closures={v?.closures}
                    // Add these two props to your form component:
                    // initialStartHour={selectedHour}
                    // initialEndHour={selectedEnd}
                    key={`${selectedHour}-${selectedEnd}`} // remount when time changes
                  />
                  {!selectedHour && (
                    <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-700">
                      <Info className="h-3.5 w-3.5 mt-0.5" /> Choose a time above to enable booking
                    </p>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
