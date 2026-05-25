import { createFileRoute } from "@tanstack/react-router";
import { makeStub } from "@/components/stub-page";
import { requireModule } from "@/lib/require-module";
export const Route = createFileRoute("/_authenticated/staff/vendors")({
  beforeLoad: () => requireModule("vendors_sponsors"),
  component: makeStub("Vendors"),
});
