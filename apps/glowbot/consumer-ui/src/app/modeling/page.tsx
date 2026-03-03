"use client";

import { useEffect, useMemo, useState } from "react";
import type { GlowbotModelingResponse } from "@/lib/glowbot";
import { GLOWBOT_METHODS } from "@/lib/glowbot";
import { rpcCall } from "@/lib/nex-client";

const MODEL_CARDS = [
  {
    model: "ad_spend_to_consults",
    title: "Ad Spend -> Booked Consults",
  },
  {
    model: "review_velocity",
    title: "Review Velocity -> Call Volume",
  },
  {
    model: "noshow_rate",
    title: "No-Show Trend vs Peer Median",
  },
] as const;

function formatValue(model: string, value: number): string {
  if (model === "ad_spend_to_consults" || model === "noshow_rate") {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toFixed(1);
}

export default function ModelingPage() {
  const [models, setModels] = useState<Array<(typeof MODEL_CARDS)[number] & { payload: GlowbotModelingResponse }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const payload = await Promise.all(
          MODEL_CARDS.map(async (item) => ({
            ...item,
            payload: await rpcCall<GlowbotModelingResponse>(GLOWBOT_METHODS.modeling, {
              model: item.model,
              window: "6m",
            }),
          })),
        );
        if (!cancelled) {
          setModels(payload);
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

  const modelCards = useMemo(() => models ?? [], [models]);

  return (
    <div className="space-y-12">
      <section className="text-center space-y-2">
        <h1 className="text-4xl font-[family-name:var(--font-serif)]">Growth Modeling</h1>
        <p className="text-gb-muted text-sm">
          Deterministic model trends and peer bands for your clinic profile
        </p>
      </section>

      {error && (
        <section className="bg-gb-card border border-gb-gold rounded-lg p-4 text-sm text-gb-muted">
          Failed to load modeling: {error}
        </section>
      )}

      {!models && !error && (
        <section className="bg-gb-card border border-gb-border rounded-lg p-4 text-sm text-gb-muted">
          Loading modeling...
        </section>
      )}

      {models && (
        <>
          <section className="space-y-8">
            {modelCards.map(({ title, model, payload }) => (
              <div key={model} className="bg-gb-card border border-gb-border rounded-lg p-8 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{title}</h2>
                    <p className="text-gb-muted text-sm mt-1">{payload.summary.insight}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gb-muted tracking-widest font-semibold">TREND</p>
                    <p className="text-gb-gold text-sm font-semibold uppercase">{payload.summary.trend}</p>
                    <p className="text-xs text-gb-muted mt-1">
                      Correlation {payload.summary.correlation.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                  {payload.series.map((point) => (
                    <div
                      key={`${model}-${point.periodStart}`}
                      className="bg-gb-bg border border-gb-border rounded p-3"
                    >
                      <p className="text-xs text-gb-muted mb-2">{point.periodLabel}</p>
                      <p className="text-lg font-[family-name:var(--font-serif)] text-gb-gold">
                        {formatValue(model, point.yourValue)}
                      </p>
                      <p className="text-xs text-gb-muted mt-2">
                        Peer {point.peerMedian === null ? "n/a" : formatValue(model, point.peerMedian)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="bg-gb-card border border-gb-border rounded-lg p-8 space-y-4">
            <h2 className="text-xl font-semibold">How Modeling Works</h2>
            <p className="text-gb-muted text-sm leading-relaxed">
              GlowBot computes deterministic series from pipeline outputs and overlays peer medians and
              peer bands. LLM recommendations use these series as inputs but do not mutate the model
              values.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
