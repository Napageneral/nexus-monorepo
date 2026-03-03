"use client";

import { useEffect, useMemo, useState } from "react";
import type { GlowbotFunnelResponse } from "@/lib/glowbot";
import { GLOWBOT_METHODS } from "@/lib/glowbot";
import { rpcCall } from "@/lib/nex-client";

function ArrowRight() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#6b6b6e"
      strokeWidth="2"
      className="shrink-0"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#c9a84c"
      strokeWidth="2"
      className="shrink-0"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

export default function FunnelPage() {
  const [funnel, setFunnel] = useState<GlowbotFunnelResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const payload = await rpcCall<GlowbotFunnelResponse>(GLOWBOT_METHODS.funnel, { period: "30d" });
        if (!cancelled) {
          setFunnel(payload);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const stages = useMemo(
    () =>
      (funnel?.steps ?? []).slice(0, 4).map((step) => ({
        label: step.name.replaceAll("_", " ").toUpperCase(),
        value: step.formattedValue,
        conversion:
          typeof step.conversionRate === "number"
            ? `${(step.conversionRate * 100).toFixed(1)}% conversion`
            : null,
      })),
    [funnel],
  );

  const comparisons = useMemo(
    () =>
      (funnel?.steps ?? [])
        .filter(
          (step) =>
            typeof step.conversionRate === "number" &&
            typeof step.peerMedian === "number" &&
            typeof step.deltaVsPeer === "number",
        )
        .slice(0, 3)
        .map((step) => ({
          title: step.name.replaceAll("_", " "),
          yours: `${(step.conversionRate! * 100).toFixed(1)}%`,
          peer: `${(step.peerMedian! * 100).toFixed(1)}%`,
          status: step.deltaVsPeer! >= 0 ? "Above peer median" : "Below peer median",
        })),
    [funnel],
  );

  const weakest = funnel?.weakestStep ?? null;

  return (
    <div className="space-y-16">
      <section className="text-center space-y-2">
        <h1 className="text-4xl font-[family-name:var(--font-serif)]">Patient Funnel</h1>
        <p className="text-gb-muted text-sm">
          Track how patients move through your acquisition process
        </p>
      </section>

      {error && (
        <section className="bg-gb-card border border-gb-gold rounded-lg p-4 text-sm text-gb-muted">
          Failed to load funnel: {error}
        </section>
      )}

      {!funnel && !error && (
        <section className="bg-gb-card border border-gb-border rounded-lg p-4 text-sm text-gb-muted">
          Loading funnel...
        </section>
      )}

      {funnel && (
        <>
          <section className="flex items-center justify-center gap-4">
            {stages.map((s, i) => (
              <div key={s.label} className="contents">
                <div className="bg-gb-card border border-gb-border rounded-lg p-8 text-center min-w-[180px]">
                  <p className="text-xs font-semibold tracking-widest text-gb-gold mb-4">
                    {s.label}
                  </p>
                  <p className="text-5xl font-[family-name:var(--font-serif)] text-gb-gold mb-3">
                    {s.value}
                  </p>
                  {s.conversion && (
                    <>
                      <div className="w-16 h-[2px] bg-gb-gold mx-auto mb-3" />
                      <p className="text-xs text-gb-muted">{s.conversion}</p>
                    </>
                  )}
                </div>
                {i < stages.length - 1 && <ArrowRight />}
              </div>
            ))}
          </section>

          <section>
            <div className="bg-gb-card border border-gb-gold rounded-lg p-6 flex items-start gap-4">
              <AlertIcon />
              <div>
                <h3 className="text-gb-gold font-semibold mb-1">
                  Largest Drop-off: {weakest ? weakest.name.replaceAll("_", " ") : "N/A"}
                </h3>
                <p className="text-gb-muted text-sm">
                  {weakest
                    ? `${weakest.recommendation} Current conversion ${(weakest.conversionRate * 100).toFixed(1)}% vs peer ${(weakest.peerMedian * 100).toFixed(1)}% (${(weakest.gap * 100).toFixed(1)}% gap).`
                    : "No significant drop-off detected for this period."}
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-[family-name:var(--font-serif)] mb-1">Peer Comparison</h2>
              <p className="text-gb-muted text-sm">
                How your conversion rates compare to clinics like yours
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {comparisons.map((c) => (
                <div key={c.title} className="bg-gb-card border border-gb-border rounded-lg p-6">
                  <h3 className="font-semibold mb-4 capitalize">{c.title}</h3>
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="text-3xl font-[family-name:var(--font-serif)] text-gb-gold">
                      {c.yours}
                    </span>
                    <span className="text-gb-muted text-sm">vs {c.peer}</span>
                  </div>
                  <p className="text-gb-muted text-sm">{c.status}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
