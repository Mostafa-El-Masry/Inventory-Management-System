"use client";

import { useEffect, useRef } from "react";

export function useHistoryAutoRefresh(
  refresh: () => Promise<void> | void,
  {
    enabled = true,
    intervalMs = 10000,
  }: {
    enabled?: boolean;
    intervalMs?: number;
  } = {},
) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const runRefresh = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void refreshRef.current();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runRefresh();
      }
    };

    const intervalId = window.setInterval(runRefresh, intervalMs);
    window.addEventListener("focus", runRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", runRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, intervalMs]);
}
