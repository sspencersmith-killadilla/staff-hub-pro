import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getPublicSurvey, submitSurveyResponse } from "@/lib/surveys.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Star } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/survey/$id")({
  component: PublicSurvey,
  head: () => ({ meta: [{ title: "Survey" }] }),
});

function PublicSurvey() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["public-survey", id],
    queryFn: () => getPublicSurvey({ data: { id } }),
  });

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: () => submitSurveyResponse({ data: { id, answers } }),
    onSuccess: () => {
      setDone(true);
      const redir = data?.survey.redirect_to;
      setTimeout(() => {
        if (redir) {
          if (/^https?:\/\//.test(redir)) window.location.href = redir;
          else navigate({ to: redir as any });
        } else {
          navigate({ to: "/" });
        }
      }, 2500);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!data) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <Card className="max-w-md w-full"><CardContent className="p-8 text-center">
          <h1 className="text-xl font-semibold mb-2">Survey not available</h1>
          <p className="text-sm text-muted-foreground">This survey is closed or doesn't exist.</p>
        </CardContent></Card>
      </div>
    );
  }
  if (done) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4 bg-slate-50">
        <Card className="max-w-md w-full"><CardContent className="p-10 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-600 mb-4" />
          <h1 className="text-2xl font-semibold mb-2">Thank you!</h1>
          <p className="text-sm text-muted-foreground">Your response has been recorded.</p>
        </CardContent></Card>
      </div>
    );
  }

  function validate(): boolean {
    for (const q of data!.questions) {
      if (q.required && (answers[q.id] == null || answers[q.id] === "")) {
        toast.error(`"${q.question_text}" is required`);
        return false;
      }
    }
    return true;
  }

  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="p-6 sm:p-8">
            <h1 className="text-2xl sm:text-3xl font-bold mb-3">{data.survey.title}</h1>
            {data.survey.description_html && (
              <div className="prose prose-sm max-w-none mb-6" dangerouslySetInnerHTML={{ __html: data.survey.description_html }} />
            )}
            <form
              className="space-y-6"
              onSubmit={(e) => { e.preventDefault(); if (validate()) submit.mutate(); }}
            >
              {data.questions.map((q: any) => (
                <div key={q.id}>
                  <Label className="text-base">
                    {q.question_text}
                    {q.required && <span className="text-red-600 ml-1">*</span>}
                  </Label>
                  <div className="mt-2">
                    {q.question_type === "text" && (
                      <Textarea value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} rows={3} />
                    )}
                    {q.question_type === "rating_1_to_5" && (
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            type="button"
                            key={n}
                            onClick={() => setAnswers({ ...answers, [q.id]: n })}
                            className="p-1"
                          >
                            <Star className={`h-8 w-8 ${(answers[q.id] ?? 0) >= n ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                          </button>
                        ))}
                      </div>
                    )}
                    {q.question_type === "multiple_choice" && (
                      <div className="space-y-2">
                        {(q.options ?? []).map((opt: string, i: number) => (
                          <label key={i} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-50 border">
                            <input
                              type="radio"
                              name={q.id}
                              checked={answers[q.id] === opt}
                              onChange={() => setAnswers({ ...answers, [q.id]: opt })}
                            />
                            <span className="text-sm">{opt}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <Button type="submit" disabled={submit.isPending} className="w-full" size="lg">
                {submit.isPending ? "Submitting…" : "Submit"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">Responses are anonymous.</p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
