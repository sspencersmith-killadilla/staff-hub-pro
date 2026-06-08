import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Sparkles, Upload, Image as ImageIcon } from "lucide-react";
import {
  adminListQuests,
  adminSaveQuest,
  adminDeleteQuest,
  type AdminQuest,
  type CompletionType,
} from "@/lib/quests.functions";
import {
  adminListPrizes,
  adminGetQuestRewards,
  adminSetQuestRewards,
  adminUploadQuestMedia,
  adminGenerateWaypointImage,
} from "@/lib/quest-prizes.functions";

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
  image_url: string | null;
  image_alt: string | null;
};

type DraftQuest = {
  id: string | null;
  title: string;
  description: string;
  badge_image_url: string;
  is_active: boolean;
  points_reward: number;
  waypoints: DraftWaypoint[];
  prizeIds: string[];
};

const emptyDraft = (): DraftQuest => ({
  id: null,
  title: "",
  description: "",
  badge_image_url: "",
  is_active: false,
  points_reward: 50,
  waypoints: [],
  prizeIds: [],
});

function toDraft(q: AdminQuest, prizeIds: string[]): DraftQuest {
  return {
    id: q.id,
    title: q.title,
    description: q.description ?? "",
    badge_image_url: q.badge_image_url ?? "",
    is_active: q.is_active,
    points_reward: q.points_reward,
    prizeIds,
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
      image_url: w.image_url ?? null,
      image_alt: w.image_alt ?? null,
    })),
  };
}

function AdminQuestsPage() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(adminListQuests);
  const save = useServerFn(adminSaveQuest);
  const remove = useServerFn(adminDeleteQuest);
  const fetchPrizes = useServerFn(adminListPrizes);
  const fetchRewards = useServerFn(adminGetQuestRewards);
  const setRewards = useServerFn(adminSetQuestRewards);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "quests"],
    queryFn: () => fetchAll(),
  });
  const { data: prizeData } = useQuery({
    queryKey: ["admin", "prizes"],
    queryFn: () => fetchPrizes(),
  });

  const [draft, setDraft] = useState<DraftQuest | null>(null);

  const quests = data?.quests ?? [];
  const prizes = prizeData?.prizes ?? [];

  const openEdit = async (q: AdminQuest) => {
    let prizeIds: string[] = [];
    try {
      const r = await fetchRewards({ data: { questId: q.id } });
      prizeIds = r.prizeIds;
    } catch {
      // ignore
    }
    setDraft(toDraft(q, prizeIds));
  };

  const saveM = useMutation({
    mutationFn: async (d: DraftQuest) => {
      const res = await save({
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
            image_url: w.image_url,
            image_alt: w.image_alt,
          })),
        },
      });
      await setRewards({ data: { questId: res.id!, prizeIds: d.prizeIds } });
      return res;
    },
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
            Build self-guided adventures. Add hero images and prize rewards to
            each quest.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/staff/admin"
            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100"
          >
            ← Admin home
          </Link>
          <Link
            to="/staff/admin/prizes"
            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100"
          >
            Manage prizes
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
                        onClick={() => openEdit(q)}
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
          prizes={prizes}
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
  prizes,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: DraftQuest;
  prizes: Array<{ id: string; name: string; image_url: string | null; fulfilled_by: "city" | "sponsor"; sponsor_name: string | null; is_active: boolean }>;
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
          image_url: null,
          image_alt: null,
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

  const togglePrize = (id: string) => {
    const has = draft.prizeIds.includes(id);
    onChange({
      ...draft,
      prizeIds: has
        ? draft.prizeIds.filter((p) => p !== id)
        : [...draft.prizeIds, id],
    });
  };

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

      {/* Prize rewards */}
      <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-amber-900">
          Prize rewards on completion
        </h3>
        <p className="mt-1 text-xs text-amber-900/80">
          Citizens who finish this quest will receive a virtual ticket for each
          selected prize.
        </p>
        {prizes.length === 0 ? (
          <p className="mt-3 text-xs text-amber-900">
            No prizes yet.{" "}
            <Link to="/staff/admin/prizes" className="font-bold underline">
              Create one →
            </Link>
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {prizes
              .filter((p) => p.is_active || draft.prizeIds.includes(p.id))
              .map((p) => {
                const checked = draft.prizeIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border-2 p-2 ${
                      checked
                        ? "border-amber-900 bg-white"
                        : "border-transparent bg-white/60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePrize(p.id)}
                      className="h-4 w-4"
                    />
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt=""
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="grid h-10 w-10 place-items-center rounded bg-amber-200 text-amber-900">
                        <ImageIcon className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {p.name}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">
                        {p.fulfilled_by === "sponsor"
                          ? `Sponsor · ${p.sponsor_name ?? "—"}`
                          : "City"}
                      </p>
                    </div>
                  </label>
                );
              })}
          </div>
        )}
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

              {/* Image picker */}
              <div className="sm:col-span-2">
                <WaypointImageField
                  imageUrl={w.image_url}
                  imageAlt={w.image_alt}
                  title={w.title}
                  description={w.description}
                  onChange={(patch) => updateWp(i, patch)}
                />
              </div>

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

function WaypointImageField({
  imageUrl,
  imageAlt,
  title,
  description,
  onChange,
}: {
  imageUrl: string | null;
  imageAlt: string | null;
  title: string;
  description: string;
  onChange: (patch: Partial<DraftWaypoint>) => void;
}) {
  const upload = useServerFn(adminUploadQuestMedia);
  const aiGen = useServerFn(adminGenerateWaypointImage);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"idle" | "upload" | "ai">("idle");

  const handleFile = async (file: File) => {
    if (file.size > 6_000_000) {
      toast.error("Image must be under 6 MB");
      return;
    }
    setBusy("upload");
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const res = await upload({
        data: {
          filename: file.name,
          contentType: file.type || "image/png",
          base64,
        },
      });
      onChange({ image_url: res.url });
      toast.success("Image uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("idle");
    }
  };

  const handleAi = async () => {
    if (!title.trim()) {
      toast.error("Add a waypoint title first");
      return;
    }
    setBusy("ai");
    try {
      const res = await aiGen({
        data: { title, description: description || null },
      });
      onChange({ image_url: res.url });
      toast.success("AI image generated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("idle");
    }
  };

  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-white p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid h-24 w-32 shrink-0 place-items-center overflow-hidden rounded border border-slate-200 bg-slate-100">
          {imageUrl ? (
            <img src={imageUrl} alt={imageAlt ?? ""} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-slate-400" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Waypoint image
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy !== "idle"}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              <Upload className="h-3 w-3" />
              {busy === "upload" ? "Uploading…" : "Upload"}
            </button>
            <button
              type="button"
              onClick={handleAi}
              disabled={busy !== "idle"}
              className="inline-flex items-center gap-1 rounded-md border border-amber-400 bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900 hover:bg-amber-200 disabled:opacity-50"
            >
              <Sparkles className="h-3 w-3" />
              {busy === "ai" ? "Generating…" : "AI generate"}
            </button>
            {imageUrl && (
              <button
                type="button"
                onClick={() => onChange({ image_url: null, image_alt: null })}
                className="rounded-md border border-rose-300 px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50"
              >
                Remove
              </button>
            )}
          </div>
          <input
            placeholder="Alt text (for accessibility)"
            value={imageAlt ?? ""}
            onChange={(e) => onChange({ image_alt: e.target.value || null })}
            className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </div>
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
