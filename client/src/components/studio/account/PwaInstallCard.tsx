import { CheckCircle2, Download, Share2, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PRODUCT_CONFIG } from "@/config/product";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as NavigatorWithStandalone).standalone)
  );
}

/**
 * Presents the native installation prompt when the browser exposes it and a
 * clear manual fallback everywhere else, including iOS Safari.
 */
export function PwaInstallCard() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isInstalled);
  const [showHelp, setShowHelp] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setMessage(`${PRODUCT_CONFIG.shortName} is installed and ready from your home screen.`);
    };

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  async function install() {
    setMessage("");
    if (!promptEvent) {
      setShowHelp((current) => !current);
      return;
    }

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setPromptEvent(null);
      setMessage(
        choice.outcome === "accepted"
          ? `Installation started. Look for ${PRODUCT_CONFIG.shortName} on your home screen.`
          : "Installation was cancelled. You can try again whenever you’re ready.",
      );
    } catch {
      setPromptEvent(null);
      setShowHelp(true);
      setMessage("The browser prompt was unavailable. Use the steps below instead.");
    }
  }

  return (
    <section className="rounded-[18px] border border-acid-400/15 bg-acid-400/[.035] p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-acid-400 text-ink-950">
          {installed ? (
            <CheckCircle2 aria-hidden className="size-5" />
          ) : (
            <Smartphone aria-hidden className="size-5" />
          )}
        </span>
        <div>
          <h3 className="text-xs font-medium">
            {installed ? "App installed" : `Install ${PRODUCT_CONFIG.shortName}`}
          </h3>
          <p className="mt-1 text-[10px] leading-4 text-white/50">
            {installed
              ? "Open it from your home screen for a focused, app-like experience."
              : "Keep your social media workspace one tap away on this device."}
          </p>
        </div>
      </div>

      {!installed ? (
        <Button className="mt-5 w-full" onClick={install} tone="secondary">
          <Download aria-hidden className="size-4" />
          {promptEvent ? "Install app" : "How to install"}
        </Button>
      ) : null}

      {showHelp && !installed ? (
        <div className="mt-4 rounded-2xl border border-white/8 bg-black/15 p-4 text-sm leading-6 text-white/55">
          <p className="flex items-center gap-2 font-bold text-white/80">
            <Share2 aria-hidden className="size-4" />
            On iPhone or iPad
          </p>
          <p className="mt-1">In Safari, tap Share, then choose Add to Home Screen.</p>
          <p className="mt-3 font-bold text-white/80">On Android or desktop</p>
          <p className="mt-1">
            Open the browser menu and choose Install app or Add to Home screen.
          </p>
        </div>
      ) : null}

      {message ? (
        <p className="mt-3 text-xs leading-5 text-white/60" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
