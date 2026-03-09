"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type {
  GlowbotIntegrationsConnectApikeyResponse,
  GlowbotIntegrationsBackfillResponse,
  GlowbotIntegrationsConnectOauthStartResponse,
  GlowbotIntegrationsConnectUploadResponse,
  GlowbotIntegrationsDisconnectResponse,
  GlowbotIntegrationsResponse,
  GlowbotIntegrationsTestResponse,
} from "@/lib/glowbot";
import { GLOWBOT_METHODS } from "@/lib/glowbot";
import type { GlowbotRpcTransportOptions } from "@/lib/nex-client";
import { rpcCall } from "@/lib/nex-client";

function CheckCircle() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function XCircle() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b6b6e" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6M9 9l6 6" />
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

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function FlaskIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 1.74 3h10.52A2 2 0 0 0 19 17l-5-9V3" />
      <path d="M8 14h8" />
    </svg>
  );
}

function UnlinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18.84 12.25A5 5 0 0 0 12 5.41l-1.5 1.5" />
      <path d="M5.16 11.75A5 5 0 0 0 12 18.59l1.5-1.5" />
      <path d="M8 16L16 8" />
      <path d="M3 21l18-18" />
    </svg>
  );
}

type IntegrationAdapter = GlowbotIntegrationsResponse["adapters"][number];
type IntegrationConnectionProfile = IntegrationAdapter["connectionProfiles"][number];
type UploadTarget = {
  adapterId: string;
  connectionProfileId: string;
};

// Transport is always runtime-ws; env var kept for future multi-transport support.
const rpcOptions: GlowbotRpcTransportOptions | undefined = undefined;

export default function IntegrationsPage() {
  const [adapters, setAdapters] = useState<IntegrationAdapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAdapterId, setBusyAdapterId] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const loadIntegrations = useCallback(async () => {
    const response = await rpcCall<GlowbotIntegrationsResponse>(GLOWBOT_METHODS.integrations, {}, rpcOptions);
    setAdapters(response.adapters);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await rpcCall<GlowbotIntegrationsResponse>(
          GLOWBOT_METHODS.integrations,
          {},
          rpcOptions,
        );
        if (!cancelled) {
          setAdapters(response.adapters);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const integrations = useMemo(
    () =>
      adapters.map((adapter) => ({
        ...adapter,
        connected: adapter.status === "connected",
        coverage: adapter.connection?.coverage ?? 0,
        lastSync: adapter.connection?.lastSync ?? "Never",
      })),
    [adapters],
  );

  const connectAdapter = useCallback(
    async (adapter: IntegrationAdapter, profile: IntegrationConnectionProfile) => {
      setBusyAdapterId(adapter.id);
      setMessage(null);
      setError(null);

      try {
        if (profile.kind === "oauth2") {
          const result = await rpcCall<GlowbotIntegrationsConnectOauthStartResponse>(
            GLOWBOT_METHODS.integrationsConnectOauthStart,
            { adapterId: adapter.id, connectionProfileId: profile.id },
            rpcOptions,
          );
          if (typeof window !== "undefined") {
            window.location.assign(result.redirectUrl);
            return;
          }
          setMessage(`OAuth start URL: ${result.redirectUrl}`);
          return;
        }

        if (profile.kind === "api-key" || profile.kind === "custom-flow") {
          const fields =
            profile.fields && profile.fields.length > 0
              ? profile.fields
              : [{ name: "api_key", label: "API Key", type: "secret", required: true }];
          const inputFields: Record<string, string> = {};

          for (const field of fields) {
            const rawValue =
              typeof window !== "undefined"
                ? window.prompt(
                    `${adapter.name}: enter ${field.label}${field.required ? "" : " (optional)"}`,
                  )
                : null;

            if (rawValue === null) {
              if (field.required) {
                setError("Connection cancelled.");
                return;
              }
              continue;
            }

            const value = rawValue.trim();
            if (!value) {
              if (field.required) {
                setError(`${field.label} is required.`);
                return;
              }
              continue;
            }

            inputFields[field.name] = value;
          }

          const result = await rpcCall<GlowbotIntegrationsConnectApikeyResponse>(
            GLOWBOT_METHODS.integrationsConnectApikey,
            {
              adapterId: adapter.id,
              connectionProfileId: profile.id,
              fields: inputFields,
            },
            rpcOptions,
          );
          if (result.status === "error") {
            setError(result.error ?? "API key connection failed");
            return;
          }
          setMessage(`${adapter.name} connected via ${profile.displayName}.`);
          await loadIntegrations();
          return;
        }

        if (profile.kind === "file-upload") {
          const input = uploadInputRef.current;
          if (!input) {
            setError("Upload input is unavailable in this browser.");
            return;
          }
          setUploadTarget({
            adapterId: adapter.id,
            connectionProfileId: profile.id,
          });
          input.value = "";
          input.click();
          return;
        }

        setError(`No supported connection profile found for ${adapter.name}.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyAdapterId(null);
      }
    },
    [loadIntegrations],
  );

  const onUploadFileSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const target = uploadTarget;
      if (!target) {
        return;
      }
      const file = event.currentTarget.files?.[0] ?? null;
      if (!file) {
        setUploadTarget(null);
        return;
      }

      setBusyAdapterId(target.adapterId);
      setMessage(null);
      setError(null);
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result !== "string") {
              reject(new Error("failed to read file"));
              return;
            }
            const payload = reader.result.includes(",")
              ? reader.result.split(",", 2)[1] ?? ""
              : reader.result;
            resolve(payload);
          };
          reader.onerror = () => reject(new Error("failed to read file"));
          reader.readAsDataURL(file);
        });

        const result = await rpcCall<GlowbotIntegrationsConnectUploadResponse>(
          GLOWBOT_METHODS.integrationsConnectUpload,
          {
            adapterId: target.adapterId,
            connectionProfileId: target.connectionProfileId,
            filename: file.name,
            file: base64,
          },
          rpcOptions,
        );
        if (result.status === "error") {
          setError(result.error ?? "Upload connection failed");
          return;
        }
        const adapter = adapters.find((item) => item.id === target.adapterId);
        setMessage(
          `${adapter?.name ?? target.adapterId} upload validated (${result.preview?.rowCount ?? 0} rows detected).`,
        );
        await loadIntegrations();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setUploadTarget(null);
        setBusyAdapterId(null);
      }
    },
    [adapters, loadIntegrations, uploadTarget],
  );

  const testAdapter = useCallback(async (adapter: IntegrationAdapter) => {
    const connectionId = adapter.connection?.connectionId;
    if (!connectionId) {
      setError(`${adapter.name} does not have an active connection.`);
      return;
    }
    setBusyAdapterId(adapter.id);
    setMessage(null);
    setError(null);
    try {
      const result = await rpcCall<GlowbotIntegrationsTestResponse>(
        GLOWBOT_METHODS.integrationsTest,
        { connectionId },
        rpcOptions,
      );
      if (result.ok) {
        setMessage(`${adapter.name} connection test passed.`);
      } else {
        setError(result.error ?? `${adapter.name} connection test failed.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAdapterId(null);
    }
  }, []);

  const backfillAdapter = useCallback(
    async (adapter: IntegrationAdapter) => {
      const connectionId = adapter.connection?.connectionId;
      if (!connectionId) {
        setError(`${adapter.name} does not have an active connection.`);
        return;
      }
      if (!adapter.backfillDefault || adapter.backfillDefault === "none") {
        setError(`${adapter.name} does not declare a backfill window.`);
        return;
      }
      setBusyAdapterId(adapter.id);
      setMessage(null);
      setError(null);
      try {
        const result = await rpcCall<GlowbotIntegrationsBackfillResponse>(
          GLOWBOT_METHODS.integrationsBackfill,
          { adapterId: adapter.id, connectionId },
          rpcOptions,
        );
        setMessage(
          `${adapter.name} backfill completed from ${result.since} (${result.recordsProcessed} records processed).`,
        );
        await loadIntegrations();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyAdapterId(null);
      }
    },
    [loadIntegrations],
  );

  const disconnectAdapter = useCallback(
    async (adapter: IntegrationAdapter) => {
      const connectionId = adapter.connection?.connectionId;
      if (!connectionId) {
        setError(`${adapter.name} does not have an active connection.`);
        return;
      }
      setBusyAdapterId(adapter.id);
      setMessage(null);
      setError(null);
      try {
        const result = await rpcCall<GlowbotIntegrationsDisconnectResponse>(
          GLOWBOT_METHODS.integrationsDisconnect,
          { connectionId },
          rpcOptions,
        );
        if (result.status === "disconnected") {
          setMessage(`${adapter.name} disconnected.`);
          await loadIntegrations();
          return;
        }
        setError(`${adapter.name} disconnect failed.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyAdapterId(null);
      }
    },
    [loadIntegrations],
  );

  return (
    <div className="space-y-12">
      <section className="text-center space-y-2">
        <h1 className="text-4xl font-[family-name:var(--font-serif)]">Integrations</h1>
        <p className="text-gb-muted text-sm">
          Connected systems power GlowBot&apos;s growth recommendations. Higher coverage improves
          accuracy.
        </p>
      </section>

      {loading && (
        <section className="bg-gb-card border border-gb-border rounded-lg p-6 text-sm text-gb-muted">
          Loading integrations...
        </section>
      )}

      {!loading && error && (
        <section className="bg-gb-card border border-gb-gold rounded-lg p-6 text-sm text-gb-gold">
          {error}
        </section>
      )}

      {!loading && message && (
        <section className="bg-gb-card border border-gb-border rounded-lg p-6 text-sm text-gb-muted">
          {message}
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {integrations.map((intg) => {
          const isBusy = busyAdapterId === intg.id;
          const supportsBackfill =
            typeof intg.backfillDefault === "string" && intg.backfillDefault !== "none";
          return (
            <div key={intg.id} className="bg-gb-card border border-gb-border rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold">{intg.name}</h3>
                {intg.connected ? <CheckCircle /> : <XCircle />}
              </div>

              <p
                className={`text-xs font-semibold tracking-wide mb-6 ${
                  intg.connected ? "text-gb-gold" : "text-gb-muted"
                }`}
              >
                {intg.connected ? "CONNECTED" : "NOT CONNECTED"}
              </p>

              {intg.connected && (
                <div className="mb-6">
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-gb-muted tracking-widest font-semibold">COVERAGE</span>
                    <span className="font-semibold">{intg.coverage}%</span>
                  </div>
                  <div className="h-1.5 bg-gb-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gb-gold rounded-full transition-all duration-500"
                      style={{ width: `${intg.coverage}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="border-t border-gb-border pt-4 mb-6">
                <p className="text-xs text-gb-muted tracking-widest font-semibold mb-1">LAST SYNC</p>
                <p className="text-sm font-semibold">{intg.lastSync}</p>
              </div>

              {intg.connected ? (
                <div className={`grid ${supportsBackfill ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
                  <button
                    onClick={() => void testAdapter(intg)}
                    disabled={isBusy}
                    className="w-full bg-gb-bg hover:bg-gb-border/50 border border-gb-border rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <FlaskIcon />
                    Test
                  </button>
                  {supportsBackfill && (
                    <button
                      onClick={() => void backfillAdapter(intg)}
                      disabled={isBusy}
                      className="w-full bg-gb-bg hover:bg-gb-border/50 border border-gb-border rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      <GearIcon />
                      Backfill
                    </button>
                  )}
                  <button
                    onClick={() => void disconnectAdapter(intg)}
                    disabled={isBusy}
                    className="w-full bg-gb-bg hover:bg-gb-border/50 border border-gb-border rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <UnlinkIcon />
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {intg.connectionProfiles.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => void connectAdapter(intg, profile)}
                      disabled={isBusy}
                      className="w-full bg-gb-bg hover:bg-gb-border/50 border border-gb-border rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {profile.kind === "oauth2" ? <LinkIcon /> : <GearIcon />}
                      {profile.displayName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <input
        ref={uploadInputRef}
        type="file"
        accept=".csv,.xlsx,.txt"
        onChange={(event) => void onUploadFileSelected(event)}
        className="hidden"
      />
    </div>
  );
}
