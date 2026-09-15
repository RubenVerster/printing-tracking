"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * How often an idle, foregrounded page re-checks the server.
 *
 * Numbers here change every few minutes at most, so a short interval costs
 * requests and phone battery without anyone noticing the difference. Drop it if
 * you want tighter sync.
 */
const POLL_MS = 15_000;

/**
 * Keeps a page in step with what other phones have saved.
 *
 * Refreshes when the page returns to the foreground, and again on a slow poll
 * while it stays there. Both are skipped when the form holds unsaved edits:
 * folding someone else's numbers in underneath a half-finished count is worse
 * than being briefly out of date.
 */
export default function LiveRefresh({
  formId,
  intervalMs = POLL_MS,
}: {
  formId?: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const dirty = useRef(false);
  const busy = useRef(false);
  const [isPending, startTransition] = useTransition();

  // Let the next poll through once the previous one has settled.
  useEffect(() => {
    if (!isPending) busy.current = false;
  }, [isPending]);

  useEffect(() => {
    const form = formId ? document.getElementById(formId) : null;
    const markDirty = () => {
      dirty.current = true;
    };
    form?.addEventListener("input", markDirty);

    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (dirty.current || busy.current) return;
      busy.current = true;
      startTransition(() => router.refresh());
    };

    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    // Safari restores a backgrounded page from cache rather than remounting,
    // so focus alone can be missed.
    window.addEventListener("pageshow", refresh);
    const timer = setInterval(refresh, intervalMs);

    return () => {
      form?.removeEventListener("input", markDirty);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      clearInterval(timer);
    };
  }, [formId, intervalMs, router]);

  return null;
}
