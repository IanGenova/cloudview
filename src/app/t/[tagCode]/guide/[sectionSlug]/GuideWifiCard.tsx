"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff, Wifi } from "lucide-react";

/**
 * Live Wi-Fi credentials inside a guide section.
 *
 * The seeded "Wi-Fi" guide item used to read "Network and password are shown
 * in the information cards" — a signpost where the answer should be. The guide
 * index already renders the real network name with working show/copy controls,
 * so pointing at it from the one section a guest opens looking for it was the
 * worst of both worlds.
 *
 * Values come from hotel settings rather than the guide item's stored text, so
 * changing the Wi-Fi password in Settings updates the guide immediately instead
 * of leaving stale credentials behind.
 */
export function GuideWifiCard({
  title,
  subtitle,
  wifiName,
  wifiPassword,
}: {
  title: string;
  subtitle?: string | null;
  wifiName: string;
  wifiPassword: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasPassword = Boolean(wifiPassword);

  async function copyPassword() {
    if (!hasPassword) {
      return;
    }

    try {
      await navigator.clipboard.writeText(wifiPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable on an insecure origin; reveal instead so
      // the guest can still read and type the password.
      setRevealed(true);
    }
  }

  return (
    <article className="overflow-hidden rounded-[1.5rem] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] p-5">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[#d5ad55]/25 bg-black/30 text-[#d5ad55]">
          <Wifi className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          {subtitle ? (
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/60">
              {subtitle}
            </p>
          ) : null}

          <h3 className="mt-1 font-serif text-xl font-light text-[#f7f2e8]">
            {title}
          </h3>

          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">
                Network
              </dt>
              <dd className="mt-1 break-words font-mono text-sm text-white/85">
                {wifiName || "Ask the front desk"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">
                Password
              </dt>
              <dd className="mt-1 break-all font-mono text-sm text-white/85">
                {hasPassword
                  ? revealed
                    ? wifiPassword
                    : "••••••••"
                  : "Ask the front desk"}
              </dd>
            </div>
          </dl>

          {hasPassword ? (
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => setRevealed((current) => !current)}
                aria-label={
                  revealed ? "Hide Wi-Fi password" : "Show Wi-Fi password"
                }
                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/72 transition hover:border-[#d5ad55]/45 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d5ad55]"
              >
                {revealed ? (
                  <EyeOff className="size-3.5" />
                ) : (
                  <Eye className="size-3.5" />
                )}
                {revealed ? "Hide" : "Show"}
              </button>

              <button
                type="button"
                onClick={copyPassword}
                aria-label="Copy Wi-Fi password"
                className="inline-flex items-center gap-2 rounded-full border border-[#d5ad55]/35 bg-[#d5ad55]/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#e8c66f] transition hover:bg-[#d5ad55]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d5ad55]"
              >
                {copied ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
