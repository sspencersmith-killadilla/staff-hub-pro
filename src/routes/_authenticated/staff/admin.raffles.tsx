import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  adminListRaffles,
  adminSaveRaffle,
  adminDeleteRaffle,
  adminDrawRaffle,
  type Raffle,
} from "@/lib/raffles.functions";
import { adminListPrizes } from "@/lib/quest-prizes.functions";
import { adminListQuests } from "@/lib/quests.functions";

export const Route = createFileRoute("/_authenticated/staff/admin/raffles")({
  component: AdminRafflesPage,
});

type Draft = {
  id: string | null;
  title: string;
  description: string;
  image_url: string;
  prize_id: string;
  draw_date: string;
  winners_count: number;
  status: "open" | "drawn" | "closed";
  quest_links: { quest_id: string; entries_per_completion: number }[];
};

const empty = (): Draft => ({
  id: null,
  title: "",
  description: "",
  image_url: "",
  prize_id: "",
  draw_date: "",
  winners_count: 1,
  status: "open",
  quest_links: [],
});

function toDraft(r: Raffle): Draft {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? "",
    image_url: r.image_url ?? "",
    prize_id: r.prize_id ?? "",
    draw_date: r.draw_date ? r.draw_date.slice(0, 16) : "",
    winners_count: r.winners_count,
    status: r.status,
    quest_links: r.linked_quest_ids.map((qid) => ({
      quest_id: qid,
      entries_per_completion: 1,
    })),
  };
}

function AdminRafflesPage() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(adminListRaffles);
  const fetchPrizes = useServerFn(adminListPrizes);
  const fetchQuests = useServerFn(adminListQuests);
  const save = useServerFn(adminSaveRaffle);
  const remove = useServerFn(adminDeleteRaffle);
  const draw = useServerFn(adminDrawRaffle);

  const { data } = useQuery({
    queryKey: ["admin", "raffles"],
    queryFn: () => fetchAll(),
  });
  const { data: prizesData } = useQuery({
    queryKey: ["admin", "prizes"],
    queryFn: () => fetchPrizes(),
  });
  const { data: questsData } = useQuery({
    queryKey: ["admin", "quests"],
    queryFn: () => fetchQuests(),
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const raffles = data?.raffles ?? [];
  const prizes = prizesData?.prizes ?? [];
  const quests = questsData?.quests ?? [];

  const saveM = useMutation({
    mutationFn: (d: Draft) =>
      save({
        data: {
          id: d.id,
          title: d.title.trim(),
          description: d.description.trim() || null,
          image_url: d.image_url.trim() || null,
          prize_id: d.prize_id || null,
          draw_date: d.draw_date ? new Date(d.draw_date).toISOString() : null,
          winners_count: d.winners_count,
          status: d.status,
          quest_links: d.quest_links,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin", "raffles"] });
      setDraft(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin", "raffles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const drawM = useMutation({
    mutationFn: (id: string) => draw({ data: { raffleId: id } }),
    onSuccess: (r) => {
      toast.success(`Drew ${r.drawn} winner(s)`);
      qc.invalidateQueries({ queryKey: ["admin", "raffles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">
            Raffles
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Award raffle entries when citizens complete linked quests, then draw
            winners.
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
            onClick={() => setDraft(empty())}
            className="rounded-md bg-slate-900 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-700"
          >
            + New raffle
          </button>
        </div>
      </div>

      <ul className="mt-6 space-y-3">
        {raffles.map((r) => (
          <li
            key={r.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex-1">
              <h3 className="font-bold text-slate-900">{r.title}</h3>
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Status: {r.status} · {r.linked_quest_ids.length} linked quest(s)
                {r.prize_name && ` · Prize: ${r.prize_name}`}
              </p>
              {r.draw_date && (
                <p className="mt-1 text-xs text-slate-600">
                  Draws {new Date(r.draw_date).toLocaleString()}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {r.status === "open" && (
                <button
                  onClick={() =>
                    confirm(`Draw winners now for "${r.title}"?`) &&
                    drawM.mutate(r.id)
                  }
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-emerald-800"
                >
                  Draw winners
                </button>
              )}
              <button
                onClick={() => setDraft(toDraft(r))}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100"
              >
                Edit
              </button>
              <button
                onClick={() =>
                  confirm(`Delete "${r.title}"?`) && delM.mutate(r.id)
                }
                className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-rose-700 hover:bg-rose-50"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
        {raffles.length === 0 && (
          <li className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No raffles yet.
          </li>
        )}
      </ul>

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6">
            <h2 className="text-lg font-bold">
              {draft.id ? "Edit raffle" : "New raffle"}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold uppercase text-slate-600">
                  Title
                </span>
                <input
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold uppercase text-slate-600">
                  Description
                </span>
                <textarea
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-600">
                  Image URL
                </span>
                <input
                  value={draft.image_url}
                  onChange={(e) =>
                    setDraft({ ...draft, image_url: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-600">
                  Prize awarded
                </span>
                <select
                  value={draft.prize_id}
                  onChange={(e) =>
                    setDraft({ ...draft, prize_id: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">— None —</option>
                  {prizes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-600">
                  Draw date
                </span>
                <input
                  type="datetime-local"
                  value={draft.draw_date}
                  onChange={(e) =>
                    setDraft({ ...draft, draw_date: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-600">
                  Winners count
                </span>
                <input
                  type="number"
                  min={1}
                  value={draft.winners_count}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      winners_count: Number(e.target.value) || 1,
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold uppercase text-slate-600">
                  Status
                </span>
                <select
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.value as any })
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="open">Open</option>
                  <option value="drawn">Drawn</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                Linked quests (entries earned per completion)
              </h3>
              <div className="mt-2 space-y-2">
                {quests.map((q) => {
                  const link = draft.quest_links.find(
                    (l) => l.quest_id === q.id,
                  );
                  return (
                    <div
                      key={q.id}
                      className="flex items-center gap-3 rounded-md border border-slate-200 p-2"
                    >
                      <input
                        type="checkbox"
                        checked={!!link}
                        onChange={(e) => {
                          const links = draft.quest_links.filter(
                            (l) => l.quest_id !== q.id,
                          );
                          if (e.target.checked) {
                            links.push({
                              quest_id: q.id,
                              entries_per_completion: 1,
                            });
                          }
                          setDraft({ ...draft, quest_links: links });
                        }}
                      />
                      <span className="flex-1 text-sm">{q.title}</span>
                      {link && (
                        <input
                          type="number"
                          min={1}
                          value={link.entries_per_completion}
                          onChange={(e) => {
                            const v = Number(e.target.value) || 1;
                            setDraft({
                              ...draft,
                              quest_links: draft.quest_links.map((l) =>
                                l.quest_id === q.id
                                  ? { ...l, entries_per_completion: v }
                                  : l,
                              ),
                            });
                          }}
                          className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setDraft(null)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => saveM.mutate(draft)}
                disabled={!draft.title.trim() || saveM.isPending}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white disabled:opacity-50"
              >
                {saveM.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
