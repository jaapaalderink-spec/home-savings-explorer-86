import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PENDING_INVITE_KEY } from "@/lib/team-policy";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      const token = (location.search as { token?: unknown }).token;
      if (location.pathname === "/uitnodiging" && typeof token === "string") {
        localStorage.setItem(PENDING_INVITE_KEY, token);
      }
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
