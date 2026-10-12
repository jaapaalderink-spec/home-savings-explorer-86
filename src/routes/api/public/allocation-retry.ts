import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Geplande herpoging van wachtende en gedeeltelijk geleverde aanvragen (tot 30 dagen). */
export const Route = createFileRoute("/api/public/allocation-retry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { retryPendingLeads } = await import("@/lib/allocation-queue.server");
        const result = await retryPendingLeads(25);
        return Response.json(result);
      },
    },
  },
});
