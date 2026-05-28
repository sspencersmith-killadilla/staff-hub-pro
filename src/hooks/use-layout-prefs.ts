import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

export type LayoutPrefs = {
  order: string[];
  hidden: string[];
};

const DEFAULT: LayoutPrefs = { order: [], hidden: [] };

function storageKey(scope: string, userId: string | undefined) {
  return `layoutPrefs:${scope}:${userId ?? "anon"}`;
}

function read(scope: string, userId: string | undefined): LayoutPrefs {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(storageKey(scope, userId));
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    return {
      order: Array.isArray(parsed.order) ? parsed.order : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
    };
  } catch {
    return DEFAULT;
  }
}

/**
 * Per-user, per-page layout preferences. Stores an explicit ordering and a
 * hidden-set for a list of section ids in localStorage.
 */
export function useLayoutPrefs(scope: string, allIds: string[]) {
  const { me } = useAuth();
  const userId = me?.userId;
  const [prefs, setPrefs] = useState<LayoutPrefs>(() => read(scope, userId));

  useEffect(() => {
    setPrefs(read(scope, userId));
  }, [scope, userId]);

  const persist = useCallback(
    (next: LayoutPrefs) => {
      setPrefs(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey(scope, userId), JSON.stringify(next));
      }
    },
    [scope, userId],
  );

  // Final ordering: saved order first (filtered to known ids), then any new ids appended.
  const orderedIds = [
    ...prefs.order.filter((id) => allIds.includes(id)),
    ...allIds.filter((id) => !prefs.order.includes(id)),
  ];

  const visibleIds = orderedIds.filter((id) => !prefs.hidden.includes(id));

  const move = useCallback(
    (id: string, direction: -1 | 1) => {
      const list = [...orderedIds];
      const idx = list.indexOf(id);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= list.length) return;
      [list[idx], list[target]] = [list[target], list[idx]];
      persist({ ...prefs, order: list });
    },
    [orderedIds, persist, prefs],
  );

  const toggleHidden = useCallback(
    (id: string) => {
      const hidden = prefs.hidden.includes(id)
        ? prefs.hidden.filter((x) => x !== id)
        : [...prefs.hidden, id];
      persist({ ...prefs, hidden });
    },
    [persist, prefs],
  );

  const reset = useCallback(() => persist(DEFAULT), [persist]);

  return { orderedIds, visibleIds, hidden: prefs.hidden, move, toggleHidden, reset };
}
