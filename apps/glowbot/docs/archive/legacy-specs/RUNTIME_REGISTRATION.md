# GlowBot Runtime Registration

Date: 2026-02-26

This is the hard-cutover runtime registration for GlowBot app mount + adapter set.

## 1) Adapter Runtime Bootstrap

Use the checked-in adapter bootstrap file:

`runtime/nex.glowbot.yaml`

Start nex with:

```bash
NEXUS_NEX_CONFIG_PATH=/Users/tyler/nexus/home/projects/nexus/apps/glowbot/runtime/nex.glowbot.yaml \
nexus up
```

Adapter command names expected on `PATH`:

1. `gog-ads-adapter`
2. `gog-places-adapter`
3. `meta-ads-adapter`
4. `patient-now-emr-adapter`
5. `zenoti-emr-adapter`
6. `apple-maps-adapter`

## 2) GlowBot App Descriptor Registration

Register the runtime app descriptor (local runtime config):

```bash
nexus config set runtime.apps.glowbot.enabled true
nexus config set runtime.apps.glowbot.displayName GlowBot
nexus config set runtime.apps.glowbot.entryPath /app/glowbot/
nexus config set runtime.apps.glowbot.apiBase /api/glowbot
```

If serving static assets directly from nex, also set:

```bash
nexus config set runtime.apps.glowbot.root /absolute/path/to/glowbot/export
```

## 3) Validation

1. `curl -s http://127.0.0.1:18789/api/apps | jq`
2. Confirm `app_id: "glowbot"` and `entry_path: "/app/glowbot/"`.
3. Open `/app/glowbot/` and confirm app assets load.
4. From frontdoor, open `/app/glowbot/?tab=overview` and confirm runtime proxy path stays unchanged.
