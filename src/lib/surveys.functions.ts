import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaff } from "./staff-guard";

const SURVEYS_PERMISSION = "page.surveys";

const QuestionSchema = z.object({
  id: z.string().uuid().optional(),
  position: z.number().int().min(0),
  question_text: z.string().min(1).max(500),
  question_type: z.enum(["text", "rating_1_to_5", "multiple_choice"]),
  options: z.array(z.string().min(1).max(200)).default([]),
  required: z.boolean().default(false),
});

const SaveSurveySchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description_html: z.string().max(50_000).default(""),
  is_active: z.boolean().default(true),
  redirect_to: z.string().max(500).nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  questions: z.array(QuestionSchema).default([]),
});

export const listSurveys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId, SURVEYS_PERMISSION);
    const { data, error } = await context.supabase
      .from("surveys")
      .select("id, title, is_active, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getSurveyForEdit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId, SURVEYS_PERMISSION);
    const [{ data: survey }, { data: questions }] = await Promise.all([
      context.supabase.from("surveys").select("*").eq("id", data.id).maybeSingle(),
      context.supabase
        .from("survey_questions")
        .select("*")
        .eq("survey_id", data.id)
        .order("position"),
    ]);
    if (!survey) throw new Error("Not found");
    return { survey, questions: questions ?? [] };
  });

export const saveSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof SaveSurveySchema>) => SaveSurveySchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId, SURVEYS_PERMISSION);
    const surveyPayload: any = {
      title: data.title,
      description_html: data.description_html,
      is_active: data.is_active,
      redirect_to: data.redirect_to ?? null,
      department_id: data.department_id ?? null,
      updated_at: new Date().toISOString(),
    };
    let surveyId = data.id;
    if (surveyId) {
      const { error } = await context.supabase
        .from("surveys")
        .update(surveyPayload)
        .eq("id", surveyId);
      if (error) throw new Error(error.message);
    } else {
      surveyPayload.created_by = context.userId;
      const { data: row, error } = await context.supabase
        .from("surveys")
        .insert(surveyPayload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      surveyId = row.id;
    }
    // replace questions
    await context.supabase.from("survey_questions").delete().eq("survey_id", surveyId);
    if (data.questions.length) {
      const rows = data.questions.map((q, idx) => ({
        survey_id: surveyId,
        position: idx,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options,
        required: q.required,
      }));
      const { error } = await context.supabase.from("survey_questions").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { id: surveyId };
  });

export const deleteSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId, SURVEYS_PERMISSION);
    const { error } = await context.supabase.from("surveys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSurveyAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId, SURVEYS_PERMISSION);
    const [{ data: survey }, { data: questions }, { data: responses }] = await Promise.all([
      context.supabase.from("surveys").select("id, title").eq("id", data.id).maybeSingle(),
      context.supabase
        .from("survey_questions")
        .select("*")
        .eq("survey_id", data.id)
        .order("position"),
      context.supabase
        .from("survey_responses")
        .select("answers, submitted_at")
        .eq("survey_id", data.id)
        .order("submitted_at", { ascending: false }),
    ]);
    if (!survey) throw new Error("Not found");
    return {
      survey,
      questions: questions ?? [],
      responses: responses ?? [],
      total: (responses ?? []).length,
    };
  });

// Public — no auth
export const getPublicSurvey = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: survey } = await supabaseAdmin
      .from("surveys")
      .select("id, title, description_html, is_active, redirect_to")
      .eq("id", data.id)
      .maybeSingle();
    if (!survey || !survey.is_active) return null;
    const { data: questions } = await supabaseAdmin
      .from("survey_questions")
      .select("id, position, question_text, question_type, options, required")
      .eq("survey_id", data.id)
      .order("position");
    return { survey, questions: questions ?? [] };
  });

export const submitSurveyResponse = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; answers: Record<string, unknown> }) =>
    z.object({ id: z.string().uuid(), answers: z.record(z.string(), z.any()) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: survey } = await supabaseAdmin
      .from("surveys")
      .select("id, is_active")
      .eq("id", data.id)
      .maybeSingle();
    if (!survey || !survey.is_active) throw new Error("Survey not available");
    const { error } = await supabaseAdmin.from("survey_responses").insert({
      survey_id: data.id,
      answers: data.answers,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
