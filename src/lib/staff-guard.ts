import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function assertStaff(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["staff", "admin"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: staff role required");
}

export async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

/** Returns the set of department IDs the user belongs to via department_roles. */
export async function getUserDepartmentIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("department_roles")
    .select("department_id")
    .eq("user_id", userId);
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return new Set();
    throw new Error(error.message);
  }
  return new Set((data ?? []).map((r: any) => r.department_id).filter(Boolean));
}

/**
 * Guard mutations against cross-department access. Admins always pass.
 * If departmentId is null/undefined (unassigned event), only admins may mutate.
 */
export async function assertCanManageDepartment(
  userId: string,
  departmentId: string | null | undefined,
) {
  if (await isAdmin(userId)) return;
  if (!departmentId) {
    throw new Error("Forbidden: only admins can manage unassigned items");
  }
  const ids = await getUserDepartmentIds(userId);
  if (!ids.has(departmentId)) {
    throw new Error("Forbidden: this item belongs to another department");
  }
}
