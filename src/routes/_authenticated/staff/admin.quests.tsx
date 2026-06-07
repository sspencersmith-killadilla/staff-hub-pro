import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  adminListQuests,
  adminSaveQuest,
  adminDeleteQuest,
  type AdminQuest,
  type AdminWaypoint,
  type CompletionType,
} from "@/lib/quests.functions";

export const Route = createFileRoute("/_authenticated/staff/admin/quests")({
  component: AdminQuestsPage,
});

type DraftWaypoint = {
  id?: string;
  title: string;
  description: string;
  completion_type: CompletionType;
  lat: string;
  lng: string;
  radius_m: string;
  sort_order: number;
  secret_code: string | null;
};

type DraftQuest = {
  id: string | null;
  title: string;
  description: string;
  badge_image_url: string;
  is_active: boolean;
  points_reward: number;
  waypoints: DraftWaypoint[];
};

const emptyDraft = (): DraftQuest => ({
  id: null,
  title: "",
  description: "",
  badge_image_url: "",
  is_active: false,
  points_reward: 50,
  waypoints: [],
});

function toDraft(q: AdminQuest): DraftQuest {
  return {
    id: q.id,
    title: q.title,
    description: q.description ?? "",
    badge_image_url: q.badge_image_url ?? "",
    is_active: q.is_active,
    points_reward: q.points_reward,
    waypoints: q.waypoints.map((w) => ({
      id: w.id,
      title: w.title,
      description: w.description ?? "",
      completion_type: w.completion_type,
      lat: w.lat == null ? "" : String(w.lat),
      lng: w.lng == null ? "" : String(w.lng),
      radius_m: w.radius_m == null ? "" : String(w.radius_m),
      sort_order: w.sort_order,
      secret_code: w.secret_code,
    })),
  };
}

function AdminQuestsPage() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(adminListQuests);
  const save = useServerFn(adminSaveQuest);
  const remove = useServerFn(adminDeleteQuest);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "quests"],
    queryFn: () => fetchAll(),
  });

  const [draft, setDraft] = useState<DraftQuest | null>(null);

  const quests = data?.quests ?? [];

  const saveM = useMutation({
    mutationFn: (d: DraftQuest) =>
      save({
        data: {
          id: d.id,
          title: d.title.trim(),
          description: d.description.trim() || null,
          badge_image_url: d.badge_image_url.trim() || null,
          is_active: d.is_active,
          points_reward: d.points_reward,
          waypoints: d.waypoints.map((w, i) => ({
            id: w.id,
            title: w.title.trim(),
            description: w.description.trim() || null,
            completion_type: w.completion_type,
            secret_code: w.secret_code,
            lat: w.lat ? Number(w.lat) : null,
            lng: w.lng ? Number(w.lng) : null,
            radius_m: w.radius_m ? Number(w.radius_m) : null,
            sort_order: i,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Quest saved");
      qc.invalidateQueries({ queryKey: ["admin", "quests"] });
      setDraft(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin", "quests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">
            Civic Quests
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Build self-guided adventures across the city. Each waypoint can be
            scanned, geo-located, or honor-system checked.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/staff/admin"
            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100"
          >
            ← Admin home
          </Link>
          <button
            onClick={() => setDraft(emptyDraft())}
            className="rounded-md bg-slate-900 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-700"
          >
            + New quest
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : quests.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No quests yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Waypoints</th>
                <th className="px-4 py-2 text-right">Points</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {quests.map((q) => (
                <tr key={q.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {q.title}
                  </td>
                  <td className="px-4 py-3">
                    {q.is_active ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-900">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {q.waypoint_count}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {q.points_reward}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setDraft(toDraft(q))}
                        className="rounded-md border border-slate-300 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() =>
                          confirm(`Delete "${q.title}"?`) && delM.mutate(q.id)
                        }
                        className="rounded-md border border-rose-300 px-3 py-1 text-xs font-bold uppercase tracking-wider text-rose-700 hover:bg-rose-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {draft && (
        <QuestBuilder
          draft={draft}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => saveM.mutate(draft)}
          saving={saveM.isPending}
        />
      )}
    </div>
  );
}

function QuestBuilder({
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: DraftQuest;
  onChange: (d: DraftQuest) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const addWaypoint = () =>
    onChange({
      ...draft,
      waypoints: [
        ...draft.waypoints,
        {
          title: "",
          description: "",
          completion_type: "qr_scan",
          lat: "",
          lng: "",
          radius_m: "50",
          sort_order: draft.waypoints.length,
          secret_code: null,
        },
      ],
    });

  const updateWp = (i: number, patch: Partial<DraftWaypoint>) => {
    const next = [...draft.waypoints];
    next[i] = { ...next[i], ...patch };
    onChange({ ...draft, waypoints: next });
  };
  const removeWp = (i: number) =>
    onChange({ ...draft, waypoints: draft.waypoints.filter((_, j) => j !== i) });

  return (
    <div className="mt-8 rounded-xl border border-slate-300 bg-white p-6">
      <h2 className="text-lg font-bold text-slate-900">
        {draft.id ? "Edit quest" : "New quest"}
      </h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Title
          </span>
          <input
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Badge image URL
          </span>
          <input
            value={draft.badge_image_url}
            onChange={(e) =>
              onChange({ ...draft, badge_image_url: e.target.value })
            }
            placeholder="https://…/badge.png"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Description
          </span>
          <textarea
            value={draft.description}
            onChange={(e) =>
              onChange({ ...draft, description: e.target.value })
            }
            rows={3}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Points reward
          </span>
          <input
            type="number"
            min={0}
            value={draft.points_reward}
            onChange={(e) =>
              onChange({ ...draft, points_reward: Number(e.target.value) || 0 })
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-end gap-2">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) =>
              onChange({ ...draft, is_active: e.target.checked })
            }
            className="h-4 w-4"
          />
          <span className="text-sm text-slate-700">Active (public)</span>
        </label>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
          Waypoints ({draft.waypoints.length})
        </h3>
        <button
          onClick={addWaypoint}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100"
        >
          + Add waypoint
        </button>
      </div>

      <ol className="mt-3 space-y-3">
        {draft.waypoints.map((w, i) => (
          <li
            key={i}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Step {i + 1}
              </span>
              <button
                onClick={() => removeWp(i)}
                className="text-xs font-bold text-rose-600 hover:text-rose-800"
              >
                Remove
              </button>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <input
                placeholder="Waypoint title"
                value={w.title}
                onChange={(e) => updateWp(i, { title: e.target.value })}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={w.completion_type}
                onChange={(e) =>
                  updateWp(i, {
                    completion_type: e.target.value as CompletionType,
                  })
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="qr_scan">QR scan</option>
                <option value="geo_location">Geo-location</option>
                <option value="honor_system_button">Honor-system button</option>
              </select>
              <textarea
                placeholder="Description / hint"
                value={w.description}
                onChange={(e) => updateWp(i, { description: e.target.value })}
                rows={2}
                className="sm:col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              {w.completion_type === "geo_location" && (
                <>
                  <input
                    placeholder="Latitude"
                    value={w.lat}
                    onChange={(e) => updateWp(i, { lat: e.target.value })}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Longitude"
                    value={w.lng}
                    onChange={(e) => updateWp(i, { lng: e.target.value })}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Radius (m)"
                    value={w.radius_m}
                    onChange={(e) =>
                      updateWp(i, { radius_m: e.target.value })
                    }
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </>
              )}
              {w.completion_type === "qr_scan" && w.id && w.secret_code && (
                <WaypointQR waypointId={w.id} secret={w.secret_code} />
              )}
              {w.completion_type === "qr_scan" && !w.id && (
                <p className="sm:col-span-2 text-xs text-slate-500">
                  QR code will be generated after saving this quest.
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || !draft.title.trim()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save quest"}
        </button>
      </div>
    </div>
  );
}

function WaypointQR({
  waypointId,
  secret,
}: {
  waypointId: string;
  secret: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const payload = `quest_${waypointId}_${secret}`;
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (ref.current) {
      QRCode.toCanvas(ref.current, payload, { width: 220, margin: 2 });
    }
    QRCode.toDataURL(payload, { width: 720, margin: 2 }, (e, url) => {
      if (!e) setDataUrl(url);
    });
  }, [payload]);

  return (
    <div className="sm:col-span-2 flex items-center gap-4 rounded-md border border-dashed border-slate-300 bg-white p-3">
      <canvas ref={ref} aria-label="Waypoint QR code" />
      <div className="flex-1 text-xs">
        <p className="font-mono break-all text-slate-700">{payload}</p>
        {dataUrl && (
          <a
            href={dataUrl}
            download={`waypoint-${waypointId.slice(0, 8)}.png`}
            className="mt-2 inline-block font-bold uppercase tracking-wider text-slate-700 hover:underline"
          >
            Download printable QR
          </a>
        )}
      </div>
    </div>
  );
}
