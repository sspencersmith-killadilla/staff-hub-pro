import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

export type AdminDepartment = {
  id: string;
  name: string;
  logo_url: string | null;
  brand_css: Record<string, string> | null;
  room_policy_text: string | null;
};

export const listDepartmentsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDepartment[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("departments")
      .select("id, name, logo_url, brand_css, room_policy_text")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as AdminDepartment[];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  logo_url: z.string().url().nullable().optional(),
  room_policy_text: z.string().max(20000).nullable().optional(),
  brand_css: z.record(z.string(), z.string()).nullable().optional(),
});

export const upsertDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => upsertSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      name: data.name,
      logo_url: data.logo_url ?? null,
      room_policy_text: data.room_policy_text ?? null,
      brand_css: data.brand_css ?? {},
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("departments")
        .update(payload)
        .eq("id", data.id)
        .select("id, name, logo_url, brand_css, room_policy_text")
        .single();
      if (error) throw new Error(error.message);
      return row as AdminDepartment;
    }
    const { data: row, error } = await supabaseAdmin
      .from("departments")
      .insert(payload)
      .select("id, name, logo_url, brand_css, room_policy_text")
      .single();
    if (error) throw new Error(error.message);
    return row as AdminDepartment;
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("departments")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Department membership management ----

export type UserDepartmentRole = {
  id: string;
  department_id: string;
  department_name: string;
  role: "super_admin" | "dept_admin" | "staff";
};

export const listUserDepartmentRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<UserDepartmentRole[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("department_roles")
      .select("id, role, department_id, department:departments(name)")
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      department_id: r.department_id,
      department_name: r.department?.name ?? "(unknown)",
      role: r.role,
    }));
  });

export const assignUserDepartmentRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      userId: z.string().uuid(),
      departmentId: z.string().uuid(),
      role: z.enum(["dept_admin", "staff"]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("department_roles")
      .upsert(
        {
          user_id: data.userId,
          department_id: data.departmentId,
          role: data.role,
        },
        { onConflict: "user_id,department_id,role" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeUserDepartmentRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("department_roles")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
