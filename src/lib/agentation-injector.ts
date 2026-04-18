/**
 * Agentation injector — injects the pre-built agentation bundle
 * into an Electron webview via executeJavaScript().
 *
 * Electron's executeJavaScript() is not restricted by CSP, so this
 * works even on pages with strict Content-Security-Policy headers.
 */

let cachedBundle: string | null = null;

/**
 * Load the pre-built agentation bundle from the public directory.
 * Cached after first load.
 */
async function loadBundle(): Promise<string> {
  if (cachedBundle) return cachedBundle;

  try {
    const response = await fetch('/agentation-bundle.js');
    if (!response.ok) {
      throw new Error(`Failed to load agentation bundle: ${response.status}`);
    }
    cachedBundle = await response.text();
    return cachedBundle;
  } catch (err) {
    console.error('[agentation-injector] Failed to load bundle:', err);
    throw err;
  }
}

export interface AgentationConfig {
  /** MCP server port for posting annotations */
  mcpPort?: number;
  /** Theme mode: 'light' | 'dark' */
  theme?: 'light' | 'dark';
  /** Accent color for the agentation UI */
  accentColor?: string;
  /** Whether to enable annotation mode immediately */
  autoEnable?: boolean;
}

/**
 * Inject the Agentation overlay into a webview element.
 *
 * Creates a Shadow DOM container to isolate the agentation UI from the host page,
 * then initializes the agentation tools (click-to-annotate, floating toolbar, etc.).
 */
export async function injectAgentation(
  webview: HTMLWebViewElement,
  config: AgentationConfig = {}
): Promise<void> {
  const wv = webview as unknown as Electron.WebviewTag;
  if (!wv.executeJavaScript) {
    console.warn('[agentation-injector] webview does not support executeJavaScript');
    return;
  }

  try {
    const bundle = await loadBundle();

    // Check if already injected
    const alreadyInjected = await wv.executeJavaScript(
      `!!document.getElementById('__agentation-root')`
    );

    if (alreadyInjected) {
      // Update config instead of re-injecting
      await wv.executeJavaScript(`
        if (window.__agentation && window.__agentation.updateConfig) {
          window.__agentation.updateConfig(${JSON.stringify(config)});
        }
      `);
      return;
    }

    // Inject the bundle and create the Shadow DOM container
    const injectionScript = `
      (function() {
        // Create shadow root container for isolation
        var host = document.createElement('div');
        host.id = '__agentation-root';
        host.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';
        document.body.appendChild(host);

        var shadow = host.attachShadow({ mode: 'open' });

        // Create a container inside shadow DOM for the agentation UI
        var container = document.createElement('div');
        container.id = 'agentation-container';
        container.style.cssText = 'width:100%;height:100%;';
        shadow.appendChild(container);

        // Store config globally for the bundle to use
        window.__agentation_config = ${JSON.stringify(config)};
        window.__agentation_shadow = shadow;
        window.__agentation_container = container;

        // Execute the agentation bundle
        try {
          ${bundle}
          // Initialize if the bundle exports an init function
          if (typeof __Agentation !== 'undefined' && __Agentation.init) {
            __Agentation.init(container, ${JSON.stringify(config)});
          }
        } catch(e) {
          console.error('[agentation] Failed to initialize:', e);
        }
      })();
    `;

    await wv.executeJavaScript(injectionScript);
    console.log('[agentation-injector] Successfully injected');
  } catch (err) {
    console.error('[agentation-injector] Injection failed:', err);
  }
}

/**
 * Remove the Agentation overlay from a webview.
 */
export async function removeAgentation(
  webview: HTMLWebViewElement
): Promise<void> {
  const wv = webview as unknown as Electron.WebviewTag;
  if (!wv.executeJavaScript) return;

  try {
    await wv.executeJavaScript(`
      (function() {
        // Cleanup agentation
        if (window.__agentation && window.__agentation.destroy) {
          window.__agentation.destroy();
        }
        var root = document.getElementById('__agentation-root');
        if (root) root.remove();
        delete window.__agentation_config;
        delete window.__agentation_shadow;
        delete window.__agentation_container;
        delete window.__agentation;
      })();
    `);
    console.log('[agentation-injector] Successfully removed');
  } catch (err) {
    console.error('[agentation-injector] Removal failed:', err);
  }
}

/**
 * Set up auto-reinject on navigation events.
 * SPA navigations (did-navigate-in-page) and full navigations (did-navigate)
 * both trigger re-injection so the overlay persists.
 */
export function setupNavigationReinject(
  webview: HTMLWebViewElement,
  config: AgentationConfig,
  enabledRef: { current: boolean }
): () => void {
  const wv = webview as unknown as Electron.WebviewTag;

  const reinject = () => {
    if (enabledRef.current) {
      // Small delay to let the page settle
      setTimeout(() => injectAgentation(webview, config), 500);
    }
  };

  wv.addEventListener('did-navigate', reinject as EventListener);
  wv.addEventListener('did-navigate-in-page', reinject as EventListener);

  return () => {
    wv.removeEventListener('did-navigate', reinject as EventListener);
    wv.removeEventListener('did-navigate-in-page', reinject as EventListener);
  };
}
