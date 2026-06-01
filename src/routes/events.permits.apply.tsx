import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useForm, FormProvider, useFormContext, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Save } from "lucide-react";
import {
  listActivePermitConfigurations,
  savePermitApplication,
  getPermit,
  payForPermit,
} from "@/lib/permits.functions";
import { toDateTimeLocalInput, localInputToIso } from "@/lib/format-time";

export const Route = createFileRoute("/events/permits/apply")({
  validateSearch: (s: Record<string, unknown>) => ({
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Special Event Permit Application" },
      {
        name: "description",
        content:
          "Apply for a city Special Event Permit — five-step wizard with dynamic fees and online payment.",
      },
    ],
  }),
  component: PermitWizardRoute,
});

const PermitSchema = z.object({
  applicant_info: z.object({
    primary_contact_name: z.string().min(1, "Required").max(200),
    primary_contact_phone: z.string().min(7, "Phone required").max(40),
    primary_contact_email: z.string().email("Valid email required").max(255),
    secondary_contact_name: z.string().max(200).optional().default(""),
    secondary_contact_phone: z.string().max(40).optional().default(""),
    secondary_contact_email: z.string().max(255).optional().default(""),
    organization_name: z.string().max(200).optional().default(""),
    organization_type: z.string().min(1, "Select an organization type").max(100),
  }),
  event_details: z.object({
    event_name: z.string().min(1, "Required").max(200),
    estimated_participants: z.coerce.number().int().min(1).max(1_000_000),
    setup_start: z.string().min(1, "Required"),
    main_start: z.string().min(1, "Required"),
    main_end: z.string().min(1, "Required"),
    teardown_end: z.string().min(1, "Required"),
    serving_alcohol: z.boolean().default(false),
    tabc_license_number: z.string().max(100).optional().default(""),
    food_vendors: z.boolean().default(false),
    electrical_voltage: z.enum(["none", "110v", "220v"]).default("none"),
    parade_included: z.boolean().default(false),
  }),
  operations_safety: z.object({
    traffic_control: z.string().min(1, "Required").max(5000),
    litter_control: z.string().min(1, "Required").max(5000),
    public_notification: z.string().min(1, "Required").max(5000),
  }),
  insurance_docs: z.object({
    insurance_url: z.string().min(1, "Required").max(1000),
    site_plan_url: z.string().min(1, "Required").max(1000),
    traffic_plan_url: z.string().min(1, "Required").max(1000),
  }),
  selected_event_type_id: z.string().uuid("Choose an event type"),
  selected_trail_fee_id: z.string().uuid("Choose a route option"),
  signature_name: z.string().min(1, "Type your full name to certify").max(200),
});

type PermitForm = z.infer<typeof PermitSchema>;

const STEPS = [
  "Applicant & Event Basics",
  "Dates, Times & Logistics",
  "Operations & Safety",
  "Document Uploads",
  "Fees & Payment",
];

function PermitWizardRoute() {
  const search = useSearch({ from: Route.id });
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setUser(s?.user ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!authReady) return <div className="min-h-screen bg-slate-50" />;
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50">
        <SiteHeader />
        <div className="mx-auto max-w-md p-10 text-center">
          <h1 className="text-2xl font-bold">Sign in required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please sign in to apply for a Special Event Permit.
          </p>
          <Button className="mt-4" onClick={() => navigate({ to: "/login" })}>
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return <PermitWizard userId={user.id} email={user.email} permitId={search.id} />;
}

function PermitWizard({
  userId,
  email,
  permitId,
}: {
  userId: string;
  email: string;
  permitId?: string;
}) {
  const navigate = useNavigate();
  const fetchConfigs = useServerFn(listActivePermitConfigurations);
  const fetchPermit = useServerFn(getPermit);
  const saveFn = useServerFn(savePermitApplication);

  const { data: configs = [], isLoading: cfgLoading } = useQuery({
    queryKey: ["permit-configs", "active"],
    queryFn: () => fetchConfigs(),
  });
  const { data: existing } = useQuery({
    queryKey: ["permit", permitId],
    queryFn: () => fetchPermit({ data: { id: permitId! } }),
    enabled: !!permitId,
  });

  const form = useForm<PermitForm>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(PermitSchema) as any,
    mode: "onBlur",
    defaultValues: {
      applicant_info: {
        primary_contact_name: "",
        primary_contact_phone: "",
        primary_contact_email: email ?? "",
        secondary_contact_name: "",
        secondary_contact_phone: "",
        secondary_contact_email: "",
        organization_name: "",
        organization_type: "",
      },
      event_details: {
        event_name: "",
        estimated_participants: 50,
        setup_start: "",
        main_start: "",
        main_end: "",
        teardown_end: "",
        serving_alcohol: false,
        tabc_license_number: "",
        food_vendors: false,
        electrical_voltage: "none",
        parade_included: false,
      },
      operations_safety: {
        traffic_control: "",
        litter_control: "",
        public_notification: "",
      },
      insurance_docs: {
        insurance_url: "",
        site_plan_url: "",
        traffic_plan_url: "",
      },
      selected_event_type_id: "",
      selected_trail_fee_id: "",
      signature_name: "",
    },
  });

  useEffect(() => {
    if (existing) {
      form.reset({
        applicant_info: {
          primary_contact_name: "",
          primary_contact_phone: "",
          primary_contact_email: email ?? "",
          secondary_contact_name: "",
          secondary_contact_phone: "",
          secondary_contact_email: "",
          organization_name: "",
          organization_type: "",
          ...(existing.applicant_info ?? {}),
        },
        event_details: (() => {
          const ed: any = {
            event_name: "",
            estimated_participants: 50,
            serving_alcohol: false,
            tabc_license_number: "",
            food_vendors: false,
            electrical_voltage: "none",
            parade_included: false,
            ...(existing.event_details ?? {}),
          };
          // Stored values may be either ISO (new) or naive local strings
          // (legacy). `toDateTimeLocalInput` handles both safely.
          ed.setup_start = toDateTimeLocalInput(ed.setup_start);
          ed.main_start = toDateTimeLocalInput(ed.main_start);
          ed.main_end = toDateTimeLocalInput(ed.main_end);
          ed.teardown_end = toDateTimeLocalInput(ed.teardown_end);
          return ed;
        })(),
        operations_safety: {
          traffic_control: "",
          litter_control: "",
          public_notification: "",
          ...(existing.operations_safety ?? {}),
        },
        insurance_docs: {
          insurance_url: "",
          site_plan_url: "",
          traffic_plan_url: "",
          ...(existing.insurance_docs ?? {}),
        },
        selected_event_type_id: existing.selected_event_type_id ?? "",
        selected_trail_fee_id: existing.selected_trail_fee_id ?? "",
        signature_name: existing.signature_name ?? "",
      });
    }
  }, [existing]);

  const [step, setStep] = useState(0);
  const [recordId, setRecordId] = useState<string | undefined>(permitId);
  const [paid, setPaid] = useState(existing?.status === "paid");

  const eventTypes = (configs as any[]).filter((c) => c.category === "event_type");
  const trailFees = (configs as any[]).filter((c) => c.category === "trail_fee");
  const baseFee = (configs as any[])
    .filter((c) => c.category === "base_fee")
    .reduce((s, c) => s + Number(c.cost ?? 0), 0);

  const selectedTrail = trailFees.find(
    (t) => t.id === form.watch("selected_trail_fee_id"),
  );
  const trailCost = selectedTrail ? Number(selectedTrail.cost) : 0;
  const totalFee = baseFee + trailCost;

  const stepFields: Array<keyof PermitForm | string[]> = [
    [
      "applicant_info.primary_contact_name",
      "applicant_info.primary_contact_phone",
      "applicant_info.primary_contact_email",
      "applicant_info.organization_type",
      "event_details.event_name",
      "event_details.estimated_participants",
      "selected_event_type_id",
    ],
    [
      "event_details.setup_start",
      "event_details.main_start",
      "event_details.main_end",
      "event_details.teardown_end",
    ],
    [
      "operations_safety.traffic_control",
      "operations_safety.litter_control",
      "operations_safety.public_notification",
    ],
    [
      "insurance_docs.insurance_url",
      "insurance_docs.site_plan_url",
      "insurance_docs.traffic_plan_url",
    ],
    ["selected_trail_fee_id", "signature_name"],
  ];

  const saveMut = useMutation({
    mutationFn: (intent: "draft" | "submit") => {
      const values = form.getValues();
      const ed = values.event_details ?? {};
      const eventDetails = {
        ...ed,
        setup_start: localInputToIso(ed.setup_start) ?? "",
        main_start: localInputToIso(ed.main_start) ?? "",
        main_end: localInputToIso(ed.main_end) ?? "",
        teardown_end: localInputToIso(ed.teardown_end) ?? "",
      };
      return saveFn({
        data: {
          id: recordId,
          applicant_info: values.applicant_info,
          event_details: eventDetails,
          operations_safety: values.operations_safety,
          insurance_docs: values.insurance_docs,
          selected_event_type_id: values.selected_event_type_id || null,
          selected_trail_fee_id: values.selected_trail_fee_id || null,
          signature_name: values.signature_name || null,
          intent,
        },
      });
    },
    onSuccess: (row, intent) => {
      setRecordId(row.id);
      if (intent === "draft") {
        toast.success("Draft saved");
      } else {
        toast.success("Submitted for review");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const goNext = async () => {
    const fields = stepFields[step] as any;
    const ok = await form.trigger(fields);
    if (!ok) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  if (cfgLoading) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <FormProvider {...form}>
        <main className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-3xl font-black tracking-tight text-[#002f49]">
            Special Event Permit Application
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete all 5 steps. You can <strong>Save Draft</strong> at any time and
            return from your Hub.
          </p>

          <Stepper step={step} />

          <Card className="mt-6">
            <CardContent className="pt-6">
              {step === 0 && <Step1 eventTypes={eventTypes} />}
              {step === 1 && <Step2 />}
              {step === 2 && <Step3 />}
              {step === 3 && <Step4 userId={userId} />}
              {step === 4 && (
                <Step5
                  trailFees={trailFees}
                  baseFee={baseFee}
                  totalFee={totalFee}
                />
              )}
            </CardContent>
          </Card>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => saveMut.mutate("draft")}
                disabled={saveMut.isPending}
              >
                <Save className="mr-1 h-4 w-4" />
                {saveMut.isPending ? "Saving…" : "Save Draft"}
              </Button>
              {step < STEPS.length - 1 ? (
                <Button type="button" onClick={goNext}>
                  Next <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={async () => {
                    const ok = await form.trigger();
                    if (!ok) {
                      toast.error("Please complete all required fields");
                      return;
                    }
                    saveMut.mutate("submit");
                  }}
                  disabled={saveMut.isPending || paid}
                >
                  {paid ? "Paid" : "Submit for Review"}
                </Button>
              )}
            </div>
          </div>

          {step === STEPS.length - 1 &&
            recordId &&
            !paid &&
            form.watch("signature_name").trim().length > 0 && (
              <Card className="mt-6 border-emerald-200 bg-emerald-50/40">
                <CardContent className="pt-6">
                  <CheckoutPanel
                    permitId={recordId}
                    amount={totalFee}
                    onPaid={() => {
                      setPaid(true);
                      toast.success("Payment received — permit marked paid");
                      navigate({ to: "/my-permits" });
                    }}
                  />
                </CardContent>
              </Card>
            )}
        </main>
      </FormProvider>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mt-6 grid grid-cols-5 gap-2">
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <li key={label} className="flex flex-col items-center text-center">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                done
                  ? "bg-emerald-600 text-white"
                  : active
                    ? "bg-[#002f49] text-white"
                    : "bg-slate-200 text-slate-500"
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={`mt-1 text-[10px] font-bold uppercase tracking-wider ${
                active ? "text-[#002f49]" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ErrText({ name }: { name: string }) {
  const {
    formState: { errors },
  } = useFormContext();
  const parts = name.split(".");
  let cur: any = errors;
  for (const p of parts) cur = cur?.[p];
  const msg = cur?.message;
  if (!msg) return null;
  return <p className="mt-1 text-xs text-destructive">{String(msg)}</p>;
}

function Step1({ eventTypes }: { eventTypes: any[] }) {
  const { register, control } = useFormContext<PermitForm>();
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold">Applicant & Event Basics</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Primary Contact Name *</Label>
          <Input {...register("applicant_info.primary_contact_name")} />
          <ErrText name="applicant_info.primary_contact_name" />
        </div>
        <div>
          <Label>Primary Phone *</Label>
          <Input {...register("applicant_info.primary_contact_phone")} />
          <ErrText name="applicant_info.primary_contact_phone" />
        </div>
        <div className="sm:col-span-2">
          <Label>Primary Email *</Label>
          <Input type="email" {...register("applicant_info.primary_contact_email")} />
          <ErrText name="applicant_info.primary_contact_email" />
        </div>
        <div>
          <Label>Secondary Contact Name</Label>
          <Input {...register("applicant_info.secondary_contact_name")} />
        </div>
        <div>
          <Label>Secondary Phone</Label>
          <Input {...register("applicant_info.secondary_contact_phone")} />
        </div>
        <div className="sm:col-span-2">
          <Label>Secondary Email</Label>
          <Input type="email" {...register("applicant_info.secondary_contact_email")} />
        </div>
        <div>
          <Label>Organization Name</Label>
          <Input {...register("applicant_info.organization_name")} />
        </div>
        <div>
          <Label>Organization Type *</Label>
          <Controller
            control={control}
            name="applicant_info.organization_type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="nonprofit">Nonprofit</SelectItem>
                  <SelectItem value="hoa">HOA / Neighborhood</SelectItem>
                  <SelectItem value="school">School</SelectItem>
                  <SelectItem value="government">Government</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          <ErrText name="applicant_info.organization_type" />
        </div>
      </div>

      <hr />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Official Event Name *</Label>
          <Input {...register("event_details.event_name")} />
          <ErrText name="event_details.event_name" />
        </div>
        <div>
          <Label>Estimated Participants *</Label>
          <Input
            type="number"
            min={1}
            {...register("event_details.estimated_participants")}
          />
          <ErrText name="event_details.estimated_participants" />
        </div>
        <div>
          <Label>Event Type *</Label>
          <Controller
            control={control}
            name="selected_event_type_id"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose event type…" />
                </SelectTrigger>
                <SelectContent>
                  {eventTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <ErrText name="selected_event_type_id" />
        </div>
      </div>
    </div>
  );
}

function Step2() {
  const { register, control, watch } = useFormContext<PermitForm>();
  const alcohol = watch("event_details.serving_alcohol");
  const food = watch("event_details.food_vendors");
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold">Dates, Times & Logistics</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Setup Start *</Label>
          <Input type="datetime-local" {...register("event_details.setup_start")} />
          <ErrText name="event_details.setup_start" />
        </div>
        <div>
          <Label>Main Event Start *</Label>
          <Input type="datetime-local" {...register("event_details.main_start")} />
          <ErrText name="event_details.main_start" />
        </div>
        <div>
          <Label>Main Event End *</Label>
          <Input type="datetime-local" {...register("event_details.main_end")} />
          <ErrText name="event_details.main_end" />
        </div>
        <div>
          <Label>Tear-down End *</Label>
          <Input type="datetime-local" {...register("event_details.teardown_end")} />
          <ErrText name="event_details.teardown_end" />
        </div>
      </div>

      <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
        <Controller
          control={control}
          name="event_details.serving_alcohol"
          render={({ field }) => (
            <label className="flex items-center gap-3 text-sm font-semibold">
              <Switch checked={field.value} onCheckedChange={field.onChange} />
              Serving alcohol?
            </label>
          )}
        />
        {alcohol && (
          <div>
            <Label>TABC License Number *</Label>
            <Input {...register("event_details.tabc_license_number")} />
          </div>
        )}

        <Controller
          control={control}
          name="event_details.food_vendors"
          render={({ field }) => (
            <label className="flex items-center gap-3 text-sm font-semibold">
              <Switch checked={field.value} onCheckedChange={field.onChange} />
              Food vendors?
            </label>
          )}
        />
        {food && (
          <div>
            <Label>Electrical voltage needed</Label>
            <Controller
              control={control}
              name="event_details.electrical_voltage"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="110v">110v</SelectItem>
                    <SelectItem value="220v">220v</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        )}

        <Controller
          control={control}
          name="event_details.parade_included"
          render={({ field }) => (
            <label className="flex items-center gap-3 text-sm font-semibold">
              <Switch checked={field.value} onCheckedChange={field.onChange} />
              Parade included?
            </label>
          )}
        />
      </div>
    </div>
  );
}

function Step3() {
  const { register } = useFormContext<PermitForm>();
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold">Operations & Safety</h2>
      <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <p>
          <strong>Reminder:</strong> You must separately submit your{" "}
          <strong>Police / Fire Public Safety Plan</strong> to the appropriate
          city department. This permit application does not replace that
          requirement.
        </p>
      </div>
      <div>
        <Label>Traffic Control / Lane Closure Details *</Label>
        <Textarea rows={4} {...register("operations_safety.traffic_control")} />
        <ErrText name="operations_safety.traffic_control" />
      </div>
      <div>
        <Label>Litter Control Plan *</Label>
        <Textarea rows={4} {...register("operations_safety.litter_control")} />
        <ErrText name="operations_safety.litter_control" />
      </div>
      <div>
        <Label>Public Notification Plan *</Label>
        <Textarea rows={4} {...register("operations_safety.public_notification")} />
        <ErrText name="operations_safety.public_notification" />
      </div>
    </div>
  );
}

function Step4({ userId }: { userId: string }) {
  const { watch, setValue } = useFormContext<PermitForm>();
  const fields: Array<{
    key: "insurance_url" | "site_plan_url" | "traffic_plan_url";
    label: string;
    hint: string;
  }> = [
    {
      key: "insurance_url",
      label: "Insurance Declaration ($1M liability proof) *",
      hint: "PDF preferred",
    },
    { key: "site_plan_url", label: "Site Plan / Route Map *", hint: "PDF or image" },
    { key: "traffic_plan_url", label: "Traffic Control Plan *", hint: "PDF or image" },
  ];

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold">Document Uploads</h2>
      {fields.map((f) => {
        const url = watch(`insurance_docs.${f.key}` as const);
        return (
          <DocUploader
            key={f.key}
            label={f.label}
            hint={f.hint}
            url={url}
            userId={userId}
            onChange={(u) => setValue(`insurance_docs.${f.key}` as const, u ?? "", { shouldValidate: true })}
            errorName={`insurance_docs.${f.key}`}
          />
        );
      })}
    </div>
  );
}

function DocUploader({
  label,
  hint,
  url,
  userId,
  onChange,
  errorName,
}: {
  label: string;
  hint: string;
  url: string;
  userId: string;
  onChange: (u: string | null) => void;
  errorName: string;
}) {
  const [uploading, setUploading] = useState(false);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("permit-docs")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("permit-docs").getPublicUrl(path);
      onChange(pub.publicUrl);
    } catch (err: any) {
      toast.error("Upload failed: " + (err?.message ?? "unknown"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <Label>{label}</Label>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
      <Input
        type="file"
        accept="application/pdf,image/*"
        onChange={handle}
        disabled={uploading}
        className="mt-2"
      />
      {uploading && <p className="mt-1 text-xs">Uploading…</p>}
      {url && (
        <div className="mt-2 flex items-center justify-between rounded border bg-white px-2 py-1 text-xs">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="truncate text-primary hover:underline"
          >
            View uploaded document
          </a>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-destructive hover:underline"
          >
            Remove
          </button>
        </div>
      )}
      <ErrText name={errorName} />
    </div>
  );
}

function Step5({
  trailFees,
  baseFee,
  totalFee,
}: {
  trailFees: any[];
  baseFee: number;
  totalFee: number;
}) {
  const { control, register } = useFormContext<PermitForm>();
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold">Fees & Payment</h2>
      <div>
        <Label>Trail / Route Use Fee *</Label>
        <Controller
          control={control}
          name="selected_trail_fee_id"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a route option…" />
              </SelectTrigger>
              <SelectContent>
                {trailFees.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label} — ${Number(t.cost).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <ErrText name="selected_trail_fee_id" />
      </div>

      <div className="rounded-lg border bg-slate-50 p-4">
        <div className="flex justify-between text-sm">
          <span>Base Application Fee</span>
          <span className="tabular-nums">${baseFee.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Trail / Route Fee</span>
          <span className="tabular-nums">${(totalFee - baseFee).toFixed(2)}</span>
        </div>
        <hr className="my-2" />
        <div className="flex justify-between text-base font-black">
          <span>Total</span>
          <span className="tabular-nums">${totalFee.toFixed(2)}</span>
        </div>
      </div>

      <div>
        <Label>Electronic Signature / Certification *</Label>
        <Input
          {...register("signature_name")}
          placeholder="Type your full legal name to certify the information is accurate"
        />
        <ErrText name="signature_name" />
        <p className="mt-1 text-[11px] text-muted-foreground">
          By typing your name and submitting, you certify under penalty of perjury
          that all information provided is true and complete.
        </p>
      </div>
    </div>
  );
}

function CheckoutPanel({
  permitId,
  amount,
  onPaid,
}: {
  permitId: string;
  amount: number;
  onPaid: () => void;
}) {
  const doPay = useServerFn(payForPermit);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    number: "",
    expiration: "",
    cvc: "",
    avs_zip: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast.error("Please agree to the terms");
      return;
    }
    setLoading(true);
    try {
      await doPay({
        data: {
          id: permitId,
          contract_accepted: true,
          full_name: form.full_name,
          email: form.email,
          card: {
            number: form.number,
            expiration: form.expiration,
            cvc: form.cvc,
            avs_zip: form.avs_zip || undefined,
          },
        },
      });
      onPaid();
    } catch (err: any) {
      toast.error("Payment failed: " + (err?.message ?? "Unknown"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <h3 className="text-sm font-black uppercase tracking-wider">
        Pay Permit Fee · ${amount.toFixed(2)}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Cardholder Name *</Label>
          <Input
            required
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          />
        </div>
        <div>
          <Label>Email *</Label>
          <Input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
      </div>
      <div>
        <Label>Card Number *</Label>
        <Input
          required
          inputMode="numeric"
          placeholder="4111 1111 1111 1111"
          value={form.number}
          onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Exp (MM/YY) *</Label>
          <Input
            required
            placeholder="12/27"
            value={form.expiration}
            onChange={(e) => setForm((f) => ({ ...f, expiration: e.target.value }))}
          />
        </div>
        <div>
          <Label>CVC *</Label>
          <Input
            required
            inputMode="numeric"
            value={form.cvc}
            onChange={(e) => setForm((f) => ({ ...f, cvc: e.target.value }))}
          />
        </div>
        <div>
          <Label>Billing ZIP</Label>
          <Input
            value={form.avs_zip}
            onChange={(e) => setForm((f) => ({ ...f, avs_zip: e.target.value }))}
          />
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <span>
          I authorize the charge of <strong>${amount.toFixed(2)}</strong> and agree
          to the city's Special Event Permit terms.
        </span>
      </label>
      <Button type="submit" disabled={loading || !agreed} className="w-full">
        {loading ? "Processing…" : `Pay $${amount.toFixed(2)}`}
      </Button>
    </form>
  );
}
