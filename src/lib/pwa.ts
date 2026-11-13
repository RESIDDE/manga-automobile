import { useEffect, useState } from "react";
import { toast } from "sonner";

// ─── Service worker ─────────────────────────────────────────────────────────
// Production only: in development a cached app shell would hide your edits.

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");

      const offerUpdate = (worker: ServiceWorker) => {
        toast("A new version of the app is ready", {
          duration: Infinity,
          action: { label: "Update", onClick: () => worker.postMessage("SKIP_WAITING") },
        });
      };

      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          // "installed" with an existing controller = an update, not a first install
          if (worker.state === "installed" && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });

      // Look for a new version whenever the app comes back to the foreground
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });

      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    } catch (e) {
      console.warn("[pwa] service worker registration failed", e);
    }
  });
}

// ─── Install prompt ─────────────────────────────────────────────────────────

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we offer it from the menu instead of the browser's banner
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
    toast.success("Manga Autos is installed");
  });
}

export const isInstalled = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * `canInstall` is true when the app can be installed from here: Chrome/Edge/
 * Android offer a real prompt; iPhone/iPad have none, so we show instructions.
 */
export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  const installed = typeof window !== "undefined" && isInstalled();
  const ios = typeof window !== "undefined" && isIOS();

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice.catch(() => null);
      deferred = null;
      notify();
      return;
    }
    if (ios) {
      toast("Install on iPhone / iPad", {
        description: "In Safari, tap the Share button, then “Add to Home Screen”.",
        duration: 10000,
      });
    }
  };

  return { canInstall: !installed && (!!deferred || ios), install };
}
