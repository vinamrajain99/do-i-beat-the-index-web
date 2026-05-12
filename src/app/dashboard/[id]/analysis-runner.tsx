"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const POLL_MS = 3000;
const STUCK_THRESHOLD_MS = 5 * 60 * 1000;

type Props = {
  analysisId: string;
  initialStatus: "pending" | "running";
  createdAt: string;
};

export function AnalysisRunner({ analysisId, initialStatus, createdAt }: Props) {
  const router = useRouter();
  // The server re-render is the source of truth for status. We use
  // `initialStatus` only to tailor the time-hint copy on first paint.
  const [retrying, setRetrying] = useState(false);
  const [stuck, setStuck] = useState(
    () => Date.now() - new Date(createdAt).getTime() > STUCK_THRESHOLD_MS,
  );
  const triggeredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const sb = createClient();
    const createdAtMs = new Date(createdAt).getTime();

    async function trigger() {
      if (triggeredRef.current) return;
      try {
        const { data } = await sb.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ analysis_id: analysisId }),
        });
        if (cancelled) return;
        if (res.ok) {
          triggeredRef.current = true;
          setRetrying(false);
        } else {
          setRetrying(true);
        }
      } catch {
        if (!cancelled) setRetrying(true);
      }
    }

    void trigger();

    const interval = setInterval(() => {
      if (cancelled) return;
      if (!triggeredRef.current) void trigger();
      setStuck(Date.now() - createdAtMs > STUCK_THRESHOLD_MS);
      startTransition(() => router.refresh());
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [analysisId, createdAt, router]);

  return (
    <div className="space-y-2">
      {retrying ? (
        <p className="text-xs text-muted-foreground">
          Reconnecting to the analysis worker…
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {initialStatus === "pending"
            ? "Starting the analysis worker…"
            : "Running — this usually takes 30–60 seconds."}
        </p>
      )}
      {stuck ? (
        <p className="text-xs text-destructive">
          This analysis has been running for over 5 minutes. Try refreshing the
          page; if it stays stuck, contact support.
        </p>
      ) : null}
    </div>
  );
}
