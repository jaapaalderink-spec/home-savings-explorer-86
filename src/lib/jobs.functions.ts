import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminRole } from "@/lib/admin-guard";
import { adminDb } from "@/lib/partner-util";

async function assertAdmin(userId: string, claims: { aal?: unknown }) {
  const db = await adminDb();
  const { data } = await adminRole(db, userId, claims);
  if (!data) throw new Error("Alleen platformbeheerders.");
  return db;
}

export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertAdmin(context.userId, context.claims);
    const { data } = await db
      .from("background_jobs")
      .select("id, kind, ref_id, status, attempts, max_attempts, last_error, next_run_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const retryJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId, context.claims);
    const { rerunJob } = await import("@/lib/allocation-queue.server");
    return rerunJob(data.id);
  });
