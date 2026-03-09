"use client";

import { useEffect, useMemo, useState } from "react";
import type { GlowbotAgentsResponse } from "@/lib/glowbot";
import { GLOWBOT_METHODS } from "@/lib/glowbot";
import { rpcCall } from "@/lib/nex-client";

function StatusIcon({ status }: { status: string }) {
  if (status === "NEEDS ATTENTION") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="1.5">
      <path d="M2 12h4l3-8 4 16 3-8h6" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

export default function AgentsPage() {
  const [response, setResponse] = useState<GlowbotAgentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const payload = await rpcCall<GlowbotAgentsResponse>(GLOWBOT_METHODS.agents, {});
        if (!cancelled) {
          setResponse(payload);
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

  const agents = useMemo(() => {
    if (!response) {
      return [];
    }
    const systemMap: Record<string, string[]> = {
      demand: ["Google Ads", "Meta Ads", "Google Maps"],
      conversion: ["Patient Now", "Zenoti"],
      local: ["Google Maps", "Apple Maps"],
      benchmark: ["Peer Benchmarks", "Industry Report Seeds"],
      modeling: ["Funnel Snapshots", "Modeling Series"],
    };
    return response.agents.map((agent) => {
      const isAttention = agent.status !== "active";
      return {
        name: agent.displayName,
        status: isAttention ? "NEEDS ATTENTION" : "ACTIVE",
        statusColor: isAttention ? "text-amber-400" : "text-gb-gold",
        systems: systemMap[agent.category] ?? ["All Systems"],
        lastRun: agent.lastRun,
        confidence: agent.confidence,
        highlighted: isAttention,
      };
    });
  }, [response]);

  return (
    <div className="space-y-12">
      <section className="text-center space-y-2">
        <h1 className="text-4xl font-[family-name:var(--font-serif)]">Growth Agents</h1>
        <p className="text-gb-muted text-sm">
          Automated analysis engines monitoring your patient acquisition
        </p>
      </section>

      {error && (
        <section className="bg-gb-card border border-gb-gold rounded-lg p-4 text-sm text-gb-muted">
          Failed to load agents: {error}
        </section>
      )}

      {!response && !error && (
        <section className="bg-gb-card border border-gb-border rounded-lg p-4 text-sm text-gb-muted">
          Loading agents...
        </section>
      )}

      {response && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className={`bg-gb-card rounded-lg p-6 border ${
                agent.highlighted ? "border-gb-gold" : "border-gb-border"
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <h3 className="text-lg font-semibold">{agent.name}</h3>
                <PulseIcon />
              </div>
              <div className="flex items-center gap-2 mb-6">
                <StatusIcon status={agent.status} />
                <span className={`text-xs font-semibold tracking-wide ${agent.statusColor}`}>
                  {agent.status}
                </span>
              </div>

              <p className="text-xs text-gb-muted tracking-widest font-semibold mb-3">
                CONNECTED SYSTEMS
              </p>
              <div className="flex flex-wrap gap-2 mb-6">
                {agent.systems.map((sys) => (
                  <span
                    key={sys}
                    className="bg-gb-bg border border-gb-border rounded px-3 py-1 text-xs"
                  >
                    {sys}
                  </span>
                ))}
              </div>

              <div className="border-t border-gb-border pt-4 flex gap-12 mb-6">
                <div>
                  <p className="text-xs text-gb-muted tracking-widest font-semibold mb-1">
                    LAST RUN
                  </p>
                  <p className="text-sm font-semibold">{agent.lastRun}</p>
                </div>
                <div>
                  <p className="text-xs text-gb-muted tracking-widest font-semibold mb-1">
                    CONFIDENCE
                  </p>
                  <p className="text-sm font-semibold">{agent.confidence}</p>
                </div>
              </div>

              <button className="w-full bg-gb-bg hover:bg-gb-border/50 border border-gb-border rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                <GearIcon />
                Configure
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
