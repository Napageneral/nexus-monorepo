import { detectCapabilities } from "../capabilities/detector.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";

const STATUS_ICON: Record<string, string> = {
  active: "✅",
  ready: "⭐",
  needs_setup: "🔧",
  needs_install: "📥",
  unavailable: "⛔",
  broken: "❌",
};

type CapabilityFilterOptions = {
  json?: boolean;
  category?: string;
  status?: string;
  compact?: boolean;
};

function normalizeCategory(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeStatus(input?: string): string | undefined {
  if (!input) return undefined;
  return input.toLowerCase().replace(/-/g, "_");
}

export async function capabilitiesCommand(
  opts?: CapabilityFilterOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const { registry, capabilities, summary } = detectCapabilities();
  const statusFilter = normalizeStatus(opts?.status);
  const categoryFilter = opts?.category
    ? normalizeCategory(opts.category)
    : undefined;

  const filtered = capabilities.filter((cap) => {
    if (statusFilter && cap.status !== statusFilter) return false;
    if (categoryFilter) {
      const normalized = normalizeCategory(cap.category);
      if (normalized !== categoryFilter) return false;
    }
    return true;
  });

  if (opts?.json) {
    runtime.log(
      JSON.stringify(
        {
          platform: `${process.platform}/${process.arch}`,
          summary,
          capabilities: filtered,
        },
        null,
        2,
      ),
    );
    return;
  }

  runtime.log(`\nNexus Capabilities (${process.platform}/${process.arch})`);
  runtime.log(
    "Legend: ✅ active  ⭐ ready  🔧 needs-setup  📥 needs-install  ⛔ unavailable  ❌ broken\n",
  );

  for (const [category, _entries] of Object.entries(registry.categories)) {
    const categoryCaps = filtered.filter((cap) => cap.category === category);
    if (categoryCaps.length === 0) continue;
    const activeCount = categoryCaps.filter(
      (cap) => cap.status === "active",
    ).length;
    runtime.log(`${category} (${activeCount}/${categoryCaps.length})`);
    for (const cap of categoryCaps) {
      const icon = STATUS_ICON[cap.status] ?? "•";
      if (opts?.compact) {
        runtime.log(`  ${icon} ${cap.id}`);
      } else {
        const providers = cap.providers.map((p) => p.id).join(", ");
        runtime.log(`  ${icon} ${cap.id} — ${providers || cap.providersRaw}`);
      }
    }
    runtime.log("");
  }
}
