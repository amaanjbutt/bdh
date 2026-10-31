import { createFileRoute, redirect } from "@tanstack/react-router";

// Search and browse now live on one page, /coverage (the catalog). /search is
// kept as a permanent redirect so old links and the ?q= entry point still work.
export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>): { q?: string; module?: string } => ({
    ...(typeof s.q === "string" && s.q ? { q: s.q } : {}),
    ...(typeof s.module === "string" && s.module ? { module: s.module } : {}),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/coverage", search, replace: true });
  },
});
