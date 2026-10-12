import { createFileRoute } from "@tanstack/react-router";

/** Geplande herpoging van wachtende aanvragen. Alleen met het juiste geheim. */
export const Route = createFileRoute("/api/public/allocation-retry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["ALLOCATION_RETRY_SECRET"];
        const given = request.headers.get("x-retry-secret");
        if (!expected || !given || given !== expected) {
          return new Response("forbidden", { status: 403 });
        }
        const { retryPendingLeads } = await import("@/lib/allocation-queue.server");
        const result = await retryPendingLeads();
        return Response.json(result);
      },
    },
  },
});
