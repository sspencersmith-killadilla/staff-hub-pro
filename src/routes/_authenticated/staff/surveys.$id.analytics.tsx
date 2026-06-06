import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSurveyAnalytics } from "@/lib/surveys.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";

export const Route = createFileRoute("/_authenticated/staff/surveys/$id/analytics")({
  component: AnalyticsPage,
});

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

function AnalyticsPage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["survey-analytics", id],
    queryFn: () => getSurveyAnalytics({ data: { id } }),
  });

  if (isLoading || !data) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <Link to="/staff/surveys/$id" params={{ id }} className="text-sm text-muted-foreground hover:underline flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to editor
        </Link>
      </div>
      <h1 className="text-2xl font-bold mb-1">{data.survey.title}</h1>
      <p className="text-sm text-muted-foreground mb-6">{data.total} response{data.total === 1 ? "" : "s"}</p>

      <div className="space-y-4">
        {data.questions.map((q: any) => (
          <QuestionCard key={q.id} question={q} responses={data.responses} />
        ))}
        {data.questions.length === 0 && <p className="text-sm text-muted-foreground">No questions in this survey.</p>}
      </div>
    </div>
  );
}

function QuestionCard({ question, responses }: { question: any; responses: any[] }) {
  const answers = responses.map((r) => r.answers?.[question.id]).filter((v) => v != null && v !== "");

  let content: React.ReactNode;
  if (question.question_type === "text") {
    content = (
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {answers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No answers yet.</p>
        ) : (
          answers.map((a, i) => (
            <div key={i} className="bg-slate-50 rounded p-2 text-sm">{String(a)}</div>
          ))
        )}
      </div>
    );
  } else if (question.question_type === "rating_1_to_5") {
    const counts = [1, 2, 3, 4, 5].map((n) => ({ name: `${n}★`, value: answers.filter((a) => Number(a) === n).length }));
    const avg = answers.length ? (answers.reduce((s, a) => s + Number(a), 0) / answers.length).toFixed(2) : "—";
    content = (
      <>
        <p className="text-sm mb-2">Average: <strong>{avg}</strong> ({answers.length} ratings)</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={counts}>
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>
    );
  } else {
    const options: string[] = question.options ?? [];
    const counts = options.map((opt) => ({ name: opt, value: answers.filter((a) => a === opt).length }));
    content = (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={counts} layout="vertical" margin={{ left: 60 }}>
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={120} />
            <Tooltip />
            <Bar dataKey="value">
              {counts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base">{question.question_text}</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
