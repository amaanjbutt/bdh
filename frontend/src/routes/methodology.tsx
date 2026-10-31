import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired 2026-10-10: the maintained version of this page is /docs/sources-provenance
// (every publisher, how each figure is traced, the pipeline). Permanent redirect so old
// links keep working.
export const Route = createFileRoute("/methodology")({
  beforeLoad: () => {
    throw redirect({ href: "/docs/sources-provenance", statusCode: 301 });
  },
});
