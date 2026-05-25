import { createFileRoute } from "@tanstack/react-router";
import { requireModule } from "@/lib/require-module";
import { ApplicationManager } from "@/components/ApplicationManager";
import { listAllVendors, setVendorStatus } from "@/lib/vendor-staff.functions";

export const Route = createFileRoute("/_authenticated/staff/vendors")({
  beforeLoad: () => requireModule("vendors_sponsors"),
  component: VendorsPage,
});

function VendorsPage() {
  return (
    <ApplicationManager
      kind="vendor"
      listFn={listAllVendors}
      setStatusFn={setVendorStatus}
      title="Vendors"
      blurb="Approve vendor applications and mark booth payments received."
    />
  );
}
