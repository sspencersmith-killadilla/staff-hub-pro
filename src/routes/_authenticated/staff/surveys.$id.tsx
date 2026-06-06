import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSurveyForEdit, saveSurvey } from "@/lib/surveys.functions";
import { listAssignableDepartments } from "@/lib/events.functions";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown, Save, BarChart3, Copy } from "lucide-react";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/staff/surveys/$id")({
  component: EditSurvey,
});

type Q = {
  id?: string;
  position: number;
  question_text: string;
  question_type: "text" | "rating_1_to_5" | "multiple_choice";
  options: string[];
  required: boolean;
};

function EditSurvey() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["survey-edit", id],
    queryFn: () => getSurveyForEdit({ data: { id } }),
  });

  const [title, setTitle] = useState("");
  const [descHtml, setDescHtml] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [redirectTo, setRedirectTo] = useState("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);

  const { data: departments = [] } = useQuery({
    queryKey: ["assignable-departments"],
    queryFn: () => listAssignableDepartments(),
  });

  useEffect(() => {
    if (!data) return;
    setTitle(data.survey.title);
    setDescHtml(data.survey.description_html || "");
    setIsActive(data.survey.is_active);
    setRedirectTo(data.survey.redirect_to || "");
    setDepartmentId((data.survey as any).department_id ?? null);
    setQuestions(
      (data.questions as any[]).map((q) => ({
        id: q.id,
        position: q.position,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options ?? [],
        required: q.required,
      })),
    );
  }, [data]);


  const save = useMutation({
    mutationFn: () =>
      saveSurvey({
        data: {
          id,
          title,
          description_html: descHtml,
          is_active: isActive,
          redirect_to: redirectTo || null,
          questions: questions.map((q, i) => ({ ...q, position: i })),
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["survey-edit", id] });
      qc.invalidateQueries({ queryKey: ["surveys"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function update(i: number, patch: Partial<Q>) {
    setQuestions(questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    setQuestions(next);
  }

  if (isLoading || !data) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/survey/${id}` : "";

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Link to="/staff/surveys" className="text-sm text-muted-foreground hover:underline flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <span className="text-sm text-muted-foreground">/</span>
          <span className="text-sm font-medium">Edit survey</span>
        </div>
        <div className="flex gap-2">
          <Link to="/staff/surveys/$id/analytics" params={{ id }}>
            <Button variant="outline" size="sm"><BarChart3 className="h-4 w-4 mr-1" /> Analytics</Button>
          </Link>
          <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="h-4 w-4 mr-1" /> Save</Button>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4 space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <RichTextEditor value={descHtml} onChange={(html) => setDescHtml(html)} minHeight={120} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label className="cursor-pointer">Active (accepting responses)</Label>
            </div>
            <div>
              <Label>Redirect URL after submit (optional)</Label>
              <Input value={redirectTo} onChange={(e) => setRedirectTo(e.target.value)} placeholder="/hub" />
            </div>
          </div>
          {isActive && (
            <div className="bg-slate-50 rounded p-3 text-sm flex items-center gap-2">
              <span className="text-muted-foreground">Public link:</span>
              <code className="flex-1 text-xs">{publicUrl}</code>
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Copied"); }}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Questions</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setQuestions([...questions, { position: questions.length, question_text: "", question_type: "text", options: [], required: false }])}>
            <Plus className="h-4 w-4 mr-1" /> Add question
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {questions.length === 0 && <p className="text-sm text-muted-foreground">No questions yet.</p>}
          {questions.map((q, i) => (
            <div key={i} className="border rounded p-3 space-y-2 bg-slate-50/50">
              <div className="flex items-start gap-2">
                <div className="flex flex-col gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === questions.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                </div>
                <div className="flex-1 space-y-2">
                  <Input value={q.question_text} onChange={(e) => update(i, { question_text: e.target.value })} placeholder={`Question ${i + 1}`} />
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={q.question_type} onValueChange={(v) => update(i, { question_type: v as Q["question_type"] })}>
                      <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Short text</SelectItem>
                        <SelectItem value="rating_1_to_5">Rating 1–5</SelectItem>
                        <SelectItem value="multiple_choice">Multiple choice</SelectItem>
                      </SelectContent>
                    </Select>
                    <label className="text-xs flex items-center gap-2">
                      <Switch checked={q.required} onCheckedChange={(c) => update(i, { required: c })} />
                      Required
                    </label>
                  </div>
                  {q.question_type === "multiple_choice" && (
                    <div className="space-y-1">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex gap-2">
                          <Input value={opt} onChange={(e) => update(i, { options: q.options.map((o, x) => (x === oi ? e.target.value : o)) })} placeholder={`Option ${oi + 1}`} className="h-8" />
                          <Button size="sm" variant="ghost" onClick={() => update(i, { options: q.options.filter((_, x) => x !== oi) })}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      ))}
                      <Button size="sm" variant="outline" onClick={() => update(i, { options: [...q.options, ""] })}><Plus className="h-3 w-3 mr-1" /> Add option</Button>
                    </div>
                  )}
                </div>
                <button onClick={() => setQuestions(questions.filter((_, x) => x !== i))} className="text-muted-foreground hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
