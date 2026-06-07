## Bug

`adminUpsertQuest` in `src/lib/quests.functions.ts` deletes all existing waypoints for the quest, then re-inserts them passing `id: w.id`. For newly-added waypoints in the admin builder, `w.id` is `undefined`, which Supabase sends as `null`, overriding the `gen_random_uuid()` default and triggering:

`null value in column "id" of relation "quest_waypoints" violates not-null constraint`

## Fix

Drop `id` from the insert payload entirely. Since the function already does a delete-then-insert replace, preserving ids has no value — the DB will generate fresh UUIDs for every waypoint via the column default.

Change in `src/lib/quests.functions.ts` (~line 418):

```ts
const inserts = data.waypoints.map((w) => ({
  quest_id: questId!,
  title: w.title,
  description: w.description ?? null,
  completion_type: w.completion_type,
  secret_code: w.completion_type === "qr_scan" ? nanoid(10) : null,
  lat: w.lat ?? null,
  lng: w.lng ?? null,
  radius_m: w.radius_m ?? null,
  sort_order: w.sort_order,
}));
```

No schema change, no other call sites affected.
