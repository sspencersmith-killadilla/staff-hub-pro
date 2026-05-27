import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { MapPin, Share2, Clock, Users, Check } from "lucide-react";
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
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(roomQO(params.id)),
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
  const [selectedDate][setSelectedDate] = useState(() =>
    new Date().toISOString().split("T")[0]
  );
  const [copied][setCopied] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const { startHour, endHour } = useMemo(() => {
    return {
      startHour: v?.open_hours?.open?? 7,
      endHour: v?.open_hours?.close?? 20,
    };
  }, [v]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
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
        {r.image_url && (
          <div className="relative h-64 md:h-80 w-full overflow-hidden rounded-2xl mb-8">
            <img
              src={r.image_url}
              alt={r.name}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-white">
                  {r.name}
                </h1>
                <p className="mt-1 text-white/80 flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {v?.name}
                  {r.building? ` • ${r.building}` : ""}
                </p>
              </div>
              <button
                onClick={handleShare}
                className="rounded-lg bg-white/20 backdrop-blur px-3 py-1.5 text-white"
              >
                {copied? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1fr_380px] items-start">
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
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {r.description}
                </p>
              </section>
            )}
          </div>

          <aside className="lg:sticky lg:top-24">
            <div className="rounded-2xl bg-white border shadow-sm">
              <div className="p-6 border-b">
                <h2 className="text-lg font-semibold">Pick date and time</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Selecting a start time reserves the next hour automatically
                </p>
              </div>

              <div className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Date
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    min={today}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>

                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Start time
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {hours.map((h) => {
                      const isStart = selectedHour === h;
                      const isNext = selectedHour!== null && h === selectedHour + 1;
                      const disabled = h > endHour - 2;
                      return (
                        <button
                          key={h}
                          disabled={disabled}
                          onClick={() => setSelectedHour(h)}
                          className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition
                            ${disabled? "opacity-40 cursor-not-allowed bg-gray-50" : "hover:bg-gray-50"}
                            ${isStart? "bg-gray-900 text-white border-gray-900" : ""}
                            ${isNext? "bg-gray-900/10 text-gray-900 border-gray-900/30" : ""}
                            ${!isStart &&!isNext &&!disabled? "bg-white border-gray-300 text-gray-700" : ""}
                          `}
                        >
                          {formatHour(h)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedHour!== null && (
                  <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
                    {new Date(selectedDate).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    • {formatHour(selectedHour)} to {formatHour(selectedEnd!)}
                  </div>
                )}

                <div className="mt-6">
                  <RoomReservationForm
                    roomId={String(r.id)}
                    openHours={v?.open_hours}
                    closures={v?.closures}
                    initialDate={selectedDate}
                    initialStartHour={selectedHour}
                    initialEndHour={selectedEnd}
                    key={`${selectedDate}-${selectedHour}`}
                  />
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
