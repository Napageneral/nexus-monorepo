import { resolveIdentitySnapshot } from "../agents/identity-state.js";
import { detectCapabilities } from "../capabilities/detector.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { listCredentials } from "./credential.js";
import {
  getQuestCatalog,
  resolveQuestState,
  startQuest,
} from "./quest-state.js";

export async function questCommand(
  opts?: {
    json?: boolean;
    list?: boolean;
    progress?: boolean;
    start?: string;
    secrets?: boolean;
    powerPath?: boolean;
    quickWins?: boolean;
  },
  runtime: RuntimeEnv = defaultRuntime,
) {
  if (opts?.start) {
    const catalog = getQuestCatalog();
    if (!catalog.some((quest) => quest.id === opts.start)) {
      runtime.error(`Unknown quest: ${opts.start}`);
      runtime.exit(1);
      return;
    }
    await startQuest(opts.start);
    if (!opts.json) {
      runtime.log(`Marked quest as in-progress: ${opts.start}`);
      runtime.log("Note: quest progress is computed dynamically (no progress.json).");
    }
  }

  const snapshot = detectCapabilities();
  const credentials = await listCredentials();
  const identityResolution = resolveIdentitySnapshot();
  const identityConfigured = identityResolution.ok
    ? identityResolution.snapshot.hasIdentity
    : false;
  const questState = await resolveQuestState({
    identityConfigured,
    capabilities: snapshot.capabilities,
    credentials,
    includeSecrets: Boolean(opts?.secrets),
  });

  let quests = questState.quests;
  if (opts?.powerPath) {
    quests = quests.filter((quest) => quest.path === "power");
  }
  if (opts?.quickWins) {
    quests = quests.filter((quest) => quest.quickWin);
  }

  if (!opts?.list && !opts?.progress) {
    quests = quests.filter((quest) => quest.status !== "completed").slice(0, 5);
  }

  if (opts?.json) {
    runtime.log(
      JSON.stringify(
        {
          power: questState.power,
          quests,
          progress: questState.progress,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (opts?.progress) {
    const completed = quests.filter(
      (quest) => quest.status === "completed",
    ).length;
    runtime.log(
      `Quest progress: ${completed}/${quests.length} complete (${questState.power.percent}%)`,
    );
    if (questState.power.nextQuest) {
      runtime.log(
        `Next unlock: ${questState.power.nextQuest.title} (+${questState.power.nextQuest.weight}%)`,
      );
    }
    return;
  }

  if (quests.length === 0) {
    runtime.log("No quests found. You're fully configured.");
    return;
  }

  runtime.log("Quests");
  for (const [idx, item] of quests.entries()) {
    const pathLabel = item.path === "secret" ? "secret" : item.path;
    runtime.log(`  ${idx + 1}. ${item.id} (${pathLabel}, ${item.status})`);
  }
}
