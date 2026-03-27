"use client";

import { useEffect } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function JobViewTracker({
  jobId,
  agencyId,
  userId,
  enabled
}: {
  jobId: string;
  agencyId: string;
  userId: string;
  enabled: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function markAsViewed() {
      const supabase = createBrowserSupabaseClient();

      const { data: existingView, error: selectError } = await supabase
        .from("job_views")
        .select("id")
        .eq("job_id", jobId)
        .eq("user_id", userId)
        .maybeSingle();

      if (cancelled || selectError || existingView) return;

      await supabase.from("job_views").insert({
        agency_id: agencyId,
        job_id: jobId,
        user_id: userId
      });
    }

    void markAsViewed();

    return () => {
      cancelled = true;
    };
  }, [agencyId, enabled, jobId, userId]);

  return null;
}
