import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/my-tickets")({
  component: () => (
    <Navigate to="/wallet" search={{ tab: "events" }} replace />
  ),
});
