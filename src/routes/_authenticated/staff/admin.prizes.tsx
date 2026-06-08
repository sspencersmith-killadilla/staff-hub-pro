import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  adminListPrizes,
  adminSavePrize,
  adminDeletePrize,
  type Prize,
} from "@/lib/quest-prizes.functions";

export const Route = createFileRoute("/_authenticated/staff/admin/prizes")({
  component: AdminPrizesPage,
});

type Draft = {
  id: string | null;
  name: string;
  description: string;
  image_url: string;
  fulfilled_by: "city" | "sponsor";
  sponsor_name: string;
  pickup_location: string;
  total_quantity: string;
  remaining_quantity: string;
  is_active: boolean;
};

const empty = (): Draft => ({
  id: null,
  name: "",
  description: "",
  image_url: "",
  fulfilled_by: "city",
  sponsor_name: "",
  pickup_location: "",
  total_quantity: "",
  remaining_quantity: "",
  is_active: true,
});

function toDraft(p: Prize): Draft {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? "",
    image_url: p.image_url ?? "",
    fulfilled_by: p.fulfilled_by,
    sponsor_name: p.sponsor_name ?? "",
    pickup_location: p.pickup_location ?? "",
    total_quantity: p.total_quantity == null ? "" : String(p.total_quantity),
    remaining_quantity:
      p.remaining_quantity == null ? "" : String(p.remaining_quantity),
    is_active: p.is_active,
  };
}

function AdminPrizesPage() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(adminListPrizes);
  const save = useServerFn(adminSavePrize);
  const remove = useServerFn(adminDeletePrize);

  const { data } = useQuery({
    queryKey: ["admin", "prizes"],
    queryFn: () => fetchAll(),
  });
  const [draft, setDraft] = useState<Draft | null>(null);

  const saveM = useMutation({
    mutationFn: (d: Draft) =>
      save({
        data: {
          id: d.id,
          name: d.name.trim(),
          description: d.description.trim() || null,
          image_url: d.image_url.trim() || null,
          fulfilled_by: d.fulfilled_by,
          sponsor_name: d.sponsor_name.trim() || null,
          pickup_location: d.pickup_location.trim() || null,
          total_quantity: d.total_quantity ? Number(d.total_quantity) : null,
          remaining_quantity: d.remaining_quantity
            ? Number(d.remaining_quantity)
            : null,
          is_active: d.is_active,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin", "prizes"] });
      setDraft(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin", "prizes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const prizes = data?.prizes ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">
            Prize Catalog
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            City- and sponsor-fulfilled prizes that can be awarded by quests or
            raffles.
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
            + New prize
          </button>
        </div>
      </div>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {prizes.map((p) => (
          <li
            key={p.id}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            {p.image_url && (
              <img
                src={p.image_url}
                alt=""
                className="h-32 w-full object-cover"
              />
            )}
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-slate-900">{p.name}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    p.is_active
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {p.is_active ? "active" : "off"}
                </span>
              </div>
              <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">
                {p.fulfilled_by}
                {p.sponsor_name ? ` · ${p.sponsor_name}` : ""}
              </p>
              {p.description && (
                <p className="mt-2 text-sm text-slate-700">{p.description}</p>
              )}
              <p className="mt-2 text-xs text-slate-600">
                Stock:{" "}
                {p.total_quantity == null
                  ? "unlimited"
                  : `${p.remaining_quantity ?? 0}/${p.total_quantity}`}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setDraft(toDraft(p))}
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100"
                >
                  Edit
                </button>
                <button
                  onClick={() =>
                    confirm(`Delete "${p.name}"?`) && delM.mutate(p.id)
                  }
                  className="rounded-md border border-rose-300 px-3 py-1 text-xs font-bold uppercase tracking-wider text-rose-700 hover:bg-rose-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
        {prizes.length === 0 && (
          <li className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No prizes yet.
          </li>
        )}
      </ul>

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6">
            <h2 className="text-lg font-bold">
              {draft.id ? "Edit prize" : "New prize"}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Image URL">
                <input
                  value={draft.image_url}
                  onChange={(e) =>
                    setDraft({ ...draft, image_url: e.target.value })
                  }
                  placeholder="https://…"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <textarea
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                  rows={2}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Fulfilled by">
                <select
                  value={draft.fulfilled_by}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      fulfilled_by: e.target.value as "city" | "sponsor",
                    })
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="city">City</option>
                  <option value="sponsor">Sponsor</option>
                </select>
              </Field>
              <Field label="Sponsor name (if any)">
                <input
                  value={draft.sponsor_name}
                  onChange={(e) =>
                    setDraft({ ...draft, sponsor_name: e.target.value })
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Pickup location" className="sm:col-span-2">
                <input
                  value={draft.pickup_location}
                  onChange={(e) =>
                    setDraft({ ...draft, pickup_location: e.target.value })
                  }
                  placeholder="City Hall, Room 102"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Total quantity (blank = unlimited)">
                <input
                  type="number"
                  value={draft.total_quantity}
                  onChange={(e) =>
                    setDraft({ ...draft, total_quantity: e.target.value })
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Remaining">
                <input
                  type="number"
                  value={draft.remaining_quantity}
                  onChange={(e) =>
                    setDraft({ ...draft, remaining_quantity: e.target.value })
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
              <label className="flex items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(e) =>
                    setDraft({ ...draft, is_active: e.target.checked })
                  }
                />
                <span className="text-sm">Active (available to award)</span>
              </label>
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
                disabled={!draft.name.trim() || saveM.isPending}
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

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
