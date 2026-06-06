async function getAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function assertStaff(userId: string, permission?: string) {
  const supabaseAdmin = await getAdminClient();
  const roleCheck = supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["staff", "admin"])
    .limit(1);
  const departmentCheck = supabaseAdmin
    .from("department_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["super_admin", "dept_admin", "staff"])
    .limit(1);
  const permissionCheck = permission
    ? supabaseAdmin
        .from("staff_permissions")
        .select("permission")
        .eq("user_id", userId)
        .eq("permission", permission)
        .limit(1)
    : Promise.resolve({ data: [], error: null });

  const [roleResult, departmentResult, permissionResult] = await Promise.all([
    roleCheck,
    departmentCheck,
    permissionCheck,
  ]);

  const error = roleResult.error ?? departmentResult.error ?? permissionResult?.error;
  if (error) {
    console.error("Staff permission check failed", { userId, permission, message: error.message });
    throw new Error("Permission check failed");
  }

  const hasRole = (roleResult.data ?? []).length > 0;
  const hasDepartmentRole = (departmentResult.data ?? []).length > 0;
  const hasPermission = (permissionResult?.data ?? []).length > 0;

  if (!hasRole && !hasDepartmentRole && !hasPermission) {
    throw new Error("Forbidden: staff permission required");
  }
}

export async function isAdmin(userId: string): Promise<boolean> {
  const supabaseAdmin = await getAdminClient();
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
  const supabaseAdmin = await getAdminClient();
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

/** Resolve the department a course belongs to (or null). */
export async function getCourseDepartmentId(courseId: string): Promise<string | null> {
  const supabaseAdmin = await getAdminClient();
  const { data } = await supabaseAdmin
    .from("courses")
    .select("department_id")
    .eq("id", courseId)
    .maybeSingle();
  return (data as any)?.department_id ?? null;
}

/** Resolve the department that owns a stage (via its venue). */
export async function getStageDepartmentId(stageId: string): Promise<string | null> {
  const supabaseAdmin = await getAdminClient();
  const { data } = await supabaseAdmin
    .from("stages")
    .select("venues:venue_id(department_id)")
    .eq("id", stageId)
    .maybeSingle();
  const v = (data as any)?.venues;
  if (Array.isArray(v)) return v[0]?.department_id ?? null;
  return v?.department_id ?? null;
}

/** Resolve the department that owns a slot (via stage → venue). */
export async function getSlotDepartmentId(slotId: number): Promise<string | null> {
  const supabaseAdmin = await getAdminClient();
  const { data } = await supabaseAdmin
    .from("slots")
    .select("stage_id")
    .eq("id", slotId)
    .maybeSingle();
  const stageId = (data as any)?.stage_id;
  if (!stageId) return null;
  return getStageDepartmentId(stageId);
}

/** Resolve the department a course session belongs to (via course). */
export async function getCourseSessionDepartmentId(sessionId: string): Promise<string | null> {
  const supabaseAdmin = await getAdminClient();
  const { data } = await supabaseAdmin
    .from("course_sessions")
    .select("course_id")
    .eq("id", sessionId)
    .maybeSingle();
  const courseId = (data as any)?.course_id;
  if (!courseId) return null;
  return getCourseDepartmentId(courseId);
}
