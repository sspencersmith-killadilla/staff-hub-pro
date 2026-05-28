import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyDepartments, type DepartmentMembership, type Department } from "@/lib/departments.functions";
import { useAuth } from "@/hooks/use-auth";

const ACTIVE_DEPT_KEY = "activeDepartmentId";

type DepartmentContextValue = {
  loading: boolean;
  memberships: DepartmentMembership[];
  activeDepartment: Department | null;
  setActiveDepartmentId: (id: string) => void;
};

const DepartmentContext = createContext<DepartmentContextValue | undefined>(undefined);

export function DepartmentProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const fetchMyDepartments = useServerFn(getMyDepartments);

  const { data, isLoading } = useQuery({
    queryKey: ["my-departments"],
    queryFn: () => fetchMyDepartments(),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const memberships = data ?? [];

  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACTIVE_DEPT_KEY);
  });

  // Reconcile active id whenever memberships load.
  useEffect(() => {
    if (!memberships.length) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    const stillValid = memberships.some((m) => m.department.id === activeId);
    if (!stillValid) {
      const next = memberships[0].department.id;
      setActiveId(next);
      if (typeof window !== "undefined") window.localStorage.setItem(ACTIVE_DEPT_KEY, next);
    }
  }, [memberships, activeId]);

  const setActiveDepartmentId = useCallback((id: string) => {
    setActiveId(id);
    if (typeof window !== "undefined") window.localStorage.setItem(ACTIVE_DEPT_KEY, id);
  }, []);

  const activeDepartment = useMemo(
    () => memberships.find((m) => m.department.id === activeId)?.department ?? null,
    [memberships, activeId],
  );

  const value: DepartmentContextValue = {
    loading: isLoading,
    memberships,
    activeDepartment,
    setActiveDepartmentId,
  };

  return <DepartmentContext.Provider value={value}>{children}</DepartmentContext.Provider>;
}

export function useDepartment() {
  const ctx = useContext(DepartmentContext);
  if (!ctx) throw new Error("useDepartment must be used within DepartmentProvider");
  return ctx;
}
