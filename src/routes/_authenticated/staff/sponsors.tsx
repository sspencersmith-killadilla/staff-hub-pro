import { createFileRoute } from "@tanstack/react-router";
import { requireModule } from "@/lib/require-module";
import { ApplicationManager } from "@/components/ApplicationManager";
import { listAllSponsors, setSponsorStatus } from "@/lib/vendor-staff.functions";

export const Route = createFileRoute("/_authenticated/staff/sponsors")({
  beforeLoad: () => requireModule("vendors_sponsors"),
  component: SponsorsPage,
});

function SponsorsPage() {
  return (
    <ApplicationManager
      kind="sponsor"
      listFn={listAllSponsors}
      setStatusFn={setSponsorStatus}
      title="Sponsors"
      blurb="Approve sponsorship applications and record payments per package."
    />
  );
}
