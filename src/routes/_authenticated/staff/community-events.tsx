import { createFileRoute } from "@tanstack/react-router";
import { makeStub } from "@/components/stub-page";
export const Route = createFileRoute("/_authenticated/staff/community-events")({ component: makeStub("Community Events") });
