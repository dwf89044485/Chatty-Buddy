"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowClockwise,
  X,
  Globe,
  Code,
  SpinnerGap,
  Eye,
} from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { usePanel } from "@/hooks/usePanel";
import { useTranslation } from "@/hooks/useTranslation";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import {
  injectAgentation,
  removeAgentation,
  setupNavigationReinject,
} from "@/lib/agentation-injector";

const BROWSER_MIN_WIDTH = 400;
const BROWSER_MAX_WIDTH = 1680;
const BROWSER_DEFAULT_WIDTH = 640;

export function BrowserPanel() {
  const { browserUrl, setBrowserUrl, setBrowserOpen, agentationEnabled, setAgentationEnabled } = usePanel();
  const { t } = useTranslation();

  const [width, setWidth] = useState(BROWSER_DEFAULT_WIDTH);
  const [inputUrl, setInputUrl] = useState(browserUrl || "http://localhost:3000");
  const [currentUrl, setCurrentUrl] = useState(browserUrl || "http://localhost:3000");
  const [pageTitle, setPageTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [watchMode, setWatchMode] = useState(false);
  const webviewRef = useRef<HTMLWebViewElement | null>(null);

  const handleResize = useCallback((delta: number) => {
    setWidth((w) => Math.min(BROWSER_MAX_WIDTH, Math.max(BROWSER_MIN_WIDTH, w - delta)));
  }, []);

  const handleClose = useCallback(() => {
    setBrowserOpen(false);
  }, [setBrowserOpen]);

  // Navigate to URL
  const navigateTo = useCallback((url: string) => {
    let normalized = url.trim();
    if (!normalized) return;

    // Add protocol if missing
    if (!/^https?:\/\//i.test(normalized)) {
      // Check if it looks like a URL (has dots) vs a search query
      if (/^localhost/.test(normalized) || /^[\w.-]+\.\w{2,}/.test(normalized)) {
        normalized = `http://${normalized}`;
      } else {
        normalized = `https://www.google.com/search?q=${encodeURIComponent(normalized)}`;
      }
    }

    setCurrentUrl(normalized);
    setBrowserUrl(normalized);

    const webview = webviewRef.current as unknown as Electron.WebviewTag | null;
    if (webview?.loadURL) {
      webview.loadURL(normalized);
    }
  }, [setBrowserUrl]);

  const handleUrlSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    navigateTo(inputUrl);
  }, [inputUrl, navigateTo]);

  const handleGoBack = useCallback(() => {
    const webview = webviewRef.current as unknown as Electron.WebviewTag | null;
    if (webview?.goBack) webview.goBack();
  }, []);

  const handleGoForward = useCallback(() => {
    const webview = webviewRef.current as unknown as Electron.WebviewTag | null;
    if (webview?.goForward) webview.goForward();
  }, []);

  const handleReload = useCallback(() => {
    const webview = webviewRef.current as unknown as Electron.WebviewTag | null;
    if (webview?.reload) webview.reload();
  }, []);

  const handleOpenDevTools = useCallback(() => {
    window.electronAPI?.browser?.openDevtools();
  }, []);

  // Attach webview event listeners
  useEffect(() => {
    const webview = webviewRef.current as unknown as Electron.WebviewTag | null;
    if (!webview) return;

    const onDidNavigate = (e: Electron.DidNavigateEvent) => {
      setCurrentUrl(e.url);
      setInputUrl(e.url);
      setBrowserUrl(e.url);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };

    const onDidNavigateInPage = (e: Electron.DidNavigateInPageEvent) => {
      if (e.isMainFrame) {
        setCurrentUrl(e.url);
        setInputUrl(e.url);
        setBrowserUrl(e.url);
        setCanGoBack(webview.canGoBack());
        setCanGoForward(webview.canGoForward());
      }
    };

    const onPageTitleUpdated = (e: Electron.PageTitleUpdatedEvent) => {
      setPageTitle(e.title);
    };

    const onDidStartLoading = () => {
      setIsLoading(true);
    };

    const onDidStopLoading = () => {
      setIsLoading(false);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };

    const onDidFailLoad = (e: Electron.DidFailLoadEvent) => {
      if (e.errorCode !== -3) { // -3 is ERR_ABORTED (navigation cancelled), not a real error
        setIsLoading(false);
        console.warn(`[BrowserPanel] Load failed: ${e.errorDescription} (${e.validatedURL})`);
      }
    };

    webview.addEventListener("did-navigate", onDidNavigate as unknown as EventListener);
    webview.addEventListener("did-navigate-in-page", onDidNavigateInPage as unknown as EventListener);
    webview.addEventListener("page-title-updated", onPageTitleUpdated as unknown as EventListener);
    webview.addEventListener("did-start-loading", onDidStartLoading);
    webview.addEventListener("did-stop-loading", onDidStopLoading);
    webview.addEventListener("did-fail-load", onDidFailLoad as unknown as EventListener);

    return () => {
      webview.removeEventListener("did-navigate", onDidNavigate as unknown as EventListener);
      webview.removeEventListener("did-navigate-in-page", onDidNavigateInPage as unknown as EventListener);
      webview.removeEventListener("page-title-updated", onPageTitleUpdated as unknown as EventListener);
      webview.removeEventListener("did-start-loading", onDidStartLoading);
      webview.removeEventListener("did-stop-loading", onDidStopLoading);
      webview.removeEventListener("did-fail-load", onDidFailLoad as unknown as EventListener);
    };
  }, [setBrowserUrl]);

  // Agentation injection: inject/remove based on toggle state
  const agentationEnabledRef = useRef(agentationEnabled);
  agentationEnabledRef.current = agentationEnabled;

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    if (agentationEnabled) {
      injectAgentation(webview, {
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        autoEnable: true,
      });

      // Set up reinject on navigation
      const cleanup = setupNavigationReinject(webview, {
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        autoEnable: true,
      }, agentationEnabledRef);

      return cleanup;
    } else {
      removeAgentation(webview);
    }
  }, [agentationEnabled]);

  // Auto-start agentation server when browser panel opens
  useEffect(() => {
    let cancelled = false;

    async function startServer() {
      try {
        const res = await fetch('/api/agentation');
        const status = await res.json();
        if (!status.running && !cancelled) {
          await fetch('/api/agentation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start' }),
          });
        }
      } catch (err) {
        console.warn('[BrowserPanel] Failed to start agentation server:', err);
      }
    }

    startServer();

    return () => {
      cancelled = true;
    };
  }, []);

  // Watch Mode: auto-refresh webview when files change
  // Uses a polling approach via the API since we can't use fs.watch from the renderer
  useEffect(() => {
    if (!watchMode) return;

    let lastCheck = Date.now();
    const interval = setInterval(async () => {
      try {
        // Check if any git-tracked files changed since last check
        const res = await fetch('/api/git/status');
        if (res.ok) {
          const data = await res.json();
          const changedFiles = data.status?.changedFiles || [];
          // If there are modified files more recent than our last check,
          // the agent likely made changes — reload the webview
          if (changedFiles.length > 0) {
            const now = Date.now();
            // Debounce: only reload every 2 seconds minimum
            if (now - lastCheck > 2000) {
              lastCheck = now;
              const webview = webviewRef.current as unknown as Electron.WebviewTag | null;
              if (webview?.reload) {
                webview.reload();
              }
            }
          }
        }
      } catch {
        // Ignore errors — not critical
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [watchMode]);

  return (
    <div className="flex h-full shrink-0 overflow-hidden">
      <ResizeHandle side="left" onResize={handleResize} />
      <div
        className="flex h-full flex-col overflow-hidden border-l border-border/40 bg-background"
        style={{ width }}
      >
        {/* Toolbar */}
        <div className="flex h-10 shrink-0 items-center gap-1 px-2 border-b border-border/40">
          {/* Navigation buttons */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleGoBack}
            disabled={!canGoBack}
            title={t("browser.back")}
          >
            <ArrowLeft size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleGoForward}
            disabled={!canGoForward}
            title={t("browser.forward")}
          >
            <ArrowRight size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleReload}
            title={t("browser.reload")}
          >
            {isLoading ? (
              <SpinnerGap size={14} className="animate-spin" />
            ) : (
              <ArrowClockwise size={14} />
            )}
          </Button>

          {/* URL bar */}
          <form onSubmit={handleUrlSubmit} className="flex flex-1 min-w-0">
            <div className="flex flex-1 items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 h-7">
              <Globe size={12} className="shrink-0 text-muted-foreground/60" />
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40"
                placeholder="Enter URL..."
                spellCheck={false}
              />
            </div>
          </form>

          {/* DevTools button */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleOpenDevTools}
            title={t("browser.devtools")}
          >
            <Code size={14} />
          </Button>

          {/* Agentation toggle */}
          <Button
            variant={agentationEnabled ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => setAgentationEnabled(!agentationEnabled)}
            title={t("browser.agentation")}
            className={agentationEnabled ? "bg-primary text-primary-foreground" : ""}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12l2 2 4-4" />
            </svg>
          </Button>

          {/* Watch Mode toggle */}
          <Button
            variant={watchMode ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => setWatchMode(!watchMode)}
            title={watchMode ? t("browser.watchModeOn") : t("browser.watchModeOff")}
            className={watchMode ? "bg-status-success text-white" : ""}
          >
            <Eye size={14} />
          </Button>

          {/* Close */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleClose}
            title={t("browser.close")}
          >
            <X size={14} />
          </Button>
        </div>

        {/* Page title bar */}
        {pageTitle && (
          <div className="flex h-6 shrink-0 items-center px-3 border-b border-border/20">
            <p className="truncate text-[11px] text-muted-foreground/60">
              {pageTitle}
            </p>
          </div>
        )}

        {/* Webview container */}
        <div className="flex-1 min-h-0 relative">
          {/*
            <webview> is an Electron-specific tag. In non-Electron environments
            (e.g., browser dev mode), we show a placeholder instead.
            The webview tag must be enabled via webviewTag: true in webPreferences.
          */}
          {typeof window !== "undefined" && window.electronAPI ? (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <webview
              ref={webviewRef as React.Ref<any>}
              src={currentUrl}
              // @ts-expect-error webview attributes aren't in React's typings
              allowpopups="true"
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Globe size={48} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">{t("browser.electronOnly")}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {t("browser.electronOnlyDesc")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
