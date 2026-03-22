"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { UpdateInfo, UpdateContextValue } from "@/hooks/useUpdate";

const CHECK_INTERVAL = 8 * 60 * 60 * 1000; // 8 hours
const DISMISSED_VERSION_KEY = "codepilot_dismissed_update_version";

/**
 * Encapsulates update-checking logic via GitHub Releases API.
 * Returns a memoised context value suitable for UpdateContext.Provider.
 */
export function useUpdateChecker(): UpdateContextValue {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  const checkForUpdates = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/app/updates");
      if (!res.ok) return;
      const data = await res.json();
      const info: UpdateInfo = {
        ...data,
        lastError: null,
      };
      setUpdateInfo(info);

      if (info.updateAvailable) {
        const dismissed = localStorage.getItem(DISMISSED_VERSION_KEY);
        if (dismissed !== info.latestVersion) {
          setShowDialog(true);
        }
      }
    } catch {
      // silently ignore network errors
    } finally {
      setChecking(false);
    }
  }, []);

  // Periodic check
  useEffect(() => {
    checkForUpdates();
    const id = setInterval(checkForUpdates, CHECK_INTERVAL);
    return () => clearInterval(id);
  }, [checkForUpdates]);

  const dismissUpdate = useCallback(() => {
    setShowDialog(false);
  }, []);

  return useMemo(
    () => ({
      updateInfo,
      checking,
      checkForUpdates,
      dismissUpdate,
      showDialog,
      setShowDialog,
    }),
    [updateInfo, checking, checkForUpdates, dismissUpdate, showDialog]
  );
}
