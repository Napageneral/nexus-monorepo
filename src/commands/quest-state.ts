import fs from "node:fs";
import path from "node:path";
import { DEFAULT_AGENT_WORKSPACE_DIR } from "../agents/workspace.js";
import type { CapabilityStatusEntry } from "../capabilities/detector.js";
import { loadConfig } from "../config/config.js";
import type { CredentialIndex } from "../credentials/store.js";
import { resolveUserPath } from "../utils.js";

export type QuestPath = "core" | "breadth" | "power" | "secret";
export type QuestStatus = "not_started" | "in_progress" | "completed";

export type QuestDefinition = {
  id: string;
  title: string;
  description: string;
  path: QuestPath;
  weight: number;
  quickWin?: boolean;
};

export type QuestProgressRecord = {
  status: QuestStatus;
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
};

export type QuestProgressFile = {
  version: number;
  updatedAt: string;
  quests: Record<string, QuestProgressRecord>;
  note?: string;
};

export type QuestSnapshot = QuestDefinition & {
  status: QuestStatus;
  autoCompleted: boolean;
};

export type PowerSummary = {
  score: number;
  baseTotal: number;
  percent: number;
  bonus: number;
  nextQuest?: { id: string; title: string; weight: number };
};

export type QuestState = {
  quests: QuestSnapshot[];
  progress: QuestProgressFile;
  power: PowerSummary;
};

const QUEST_CATALOG: QuestDefinition[] = [
  {
    id: "identity-setup",
    title: "Identity setup",
    description: "Create the agent + user identity files.",
    path: "core",
    weight: 10,
    quickWin: true,
  },
  {
    id: "filesystem-wow",
    title: "Filesystem organization",
    description: "Use home/ projects + memory for a quick win.",
    path: "core",
    weight: 5,
    quickWin: true,
  },
  {
    id: "credential-manager",
    title: "Credential manager",
    description: "Store your first credentials for secure access.",
    path: "core",
    weight: 15,
  },
  {
    id: "cloud-backup",
    title: "Cloud backup",
    description: "Set up Nexus Cloud sync + rollback.",
    path: "core",
    weight: 10,
  },
  {
    id: "connect-email",
    title: "Connect email",
    description: "Unlock email read/send capabilities.",
    path: "breadth",
    weight: 10,
  },
  {
    id: "connect-messages",
    title: "Connect messages",
    description: "Unlock messaging read/send capabilities.",
    path: "breadth",
    weight: 10,
  },
  {
    id: "connect-calendar",
    title: "Connect calendar",
    description: "Unlock calendar access.",
    path: "breadth",
    weight: 5,
  },
  {
    id: "enable-llm",
    title: "Enable LLM",
    description: "Configure an LLM provider.",
    path: "breadth",
    weight: 5,
  },
  {
    id: "enable-scheduling",
    title: "Enable scheduling",
    description: "Turn on scheduling automation.",
    path: "power",
    weight: 10,
  },
  {
    id: "enable-agent-comms",
    title: "Enable agent comms",
    description: "Let your agent reach you outside the IDE.",
    path: "power",
    weight: 15,
  },
  {
    id: "first-automation",
    title: "First automation",
    description: "Set up a reactive trigger.",
    path: "power",
    weight: 5,
  },
  {
    id: "completionist",
    title: "Completionist",
    description: "Unlock everything in the catalog.",
    path: "secret",
    weight: 5,
  },
  {
    id: "polyglot",
    title: "Polyglot",
    description: "Connect 3+ distinct messaging platforms.",
    path: "secret",
    weight: 5,
  },
  {
    id: "social-butterfly",
    title: "Social butterfly",
    description: "Connect multiple social networks.",
    path: "secret",
    weight: 5,
  },
  {
    id: "home-automation",
    title: "Home automation",
    description: "Activate smart home capabilities.",
    path: "secret",
    weight: 5,
  },
  {
    id: "full-stack",
    title: "Full stack",
    description: "Enable web + automation + dev tooling.",
    path: "secret",
    weight: 5,
  },
];

const QUEST_ORDER = QUEST_CATALOG.map((quest) => quest.id);

const QUEST_PROGRESS_VERSION = 1;
const PROGRESS_NOTE =
  "Progress is computed dynamically; no persistent progress.json.";

function getCapabilityStatusMap(
  capabilities: CapabilityStatusEntry[],
): Map<string, CapabilityStatusEntry["status"]> {
  return new Map(capabilities.map((cap) => [cap.id, cap.status]));
}

function isCapabilityReady(
  status: CapabilityStatusEntry["status"] | undefined,
): boolean {
  return status === "active" || status === "ready";
}

async function dirHasEntries(dir: string): Promise<boolean> {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    return entries.some((entry) => entry.name && !entry.name.startsWith("."));
  } catch {
    return false;
  }
}

function resolveWorkspaceDir(): string {
  const config = loadConfig();
  return resolveUserPath(
    config.agent?.workspace ?? DEFAULT_AGENT_WORKSPACE_DIR,
  );
}

function computeQuestAutoCompletion(params: {
  identityConfigured: boolean;
  capabilities: CapabilityStatusEntry[];
  credentials: CredentialIndex;
  workspaceDir: string;
}): Promise<Record<string, boolean>> {
  const { identityConfigured, capabilities, credentials, workspaceDir } =
    params;
  const capabilityMap = getCapabilityStatusMap(capabilities);
  const hasCredentials = Object.keys(credentials.services ?? {}).length > 0;
  const anyReady = (ids: string[]) =>
    ids.some((id) => isCapabilityReady(capabilityMap.get(id)));

  return (async () => {
    const hasProjects = await dirHasEntries(
      path.join(workspaceDir, "projects"),
    );
    const hasMemory = await dirHasEntries(path.join(workspaceDir, "memory"));
    const readySocial =
      anyReady(["social-x", "social-instagram", "social-linkedin"]) ||
      anyReady(["social", "social-news"]);
    const readyMessaging = anyReady(["messaging-read", "messaging-send"]);
    const readyChat = anyReady(["chat-send", "chat-read"]);
    const readySmartHome = anyReady([
      "smart-lights",
      "smart-audio",
      "smart-sleep",
      "bluetooth",
      "camera-control",
    ]);
    const readyDev = anyReady(["version-control", "terminal-sessions"]);
    const readyWeb = anyReady(["web-search", "url-fetch"]);
    const readyAutomation = anyReady(["reactive-triggers"]);

    return {
      "identity-setup": identityConfigured,
      "filesystem-wow": hasProjects || hasMemory,
      "credential-manager": hasCredentials,
      "cloud-backup": anyReady(["cloud-sync", "rollback"]),
      "connect-email": anyReady(["email-read", "email-send"]),
      "connect-messages": readyMessaging,
      "connect-calendar": anyReady(["calendar"]),
      "enable-llm": anyReady(["anthropic", "openai", "gemini"]),
      "enable-scheduling": anyReady(["scheduling"]),
      "enable-agent-comms": readyChat || readyMessaging,
      "first-automation": readyAutomation,
      completionist: capabilities.every((cap) => cap.status === "active"),
      polyglot: readyMessaging && readyChat,
      "social-butterfly": readySocial,
      "home-automation": readySmartHome,
      "full-stack": readyWeb && readyAutomation && readyDev,
    };
  })();
}

function computePower(quests: QuestSnapshot[]): PowerSummary {
  const baseQuests = quests.filter((quest) => quest.path !== "secret");
  const bonusQuests = quests.filter(
    (quest) => quest.path === "secret" && quest.status === "completed",
  );
  const baseTotal = baseQuests.reduce((sum, quest) => sum + quest.weight, 0);
  const baseScore = baseQuests.reduce(
    (sum, quest) => sum + (quest.status === "completed" ? quest.weight : 0),
    0,
  );
  const bonus = bonusQuests.reduce((sum, quest) => sum + quest.weight, 0);
  const percent = baseTotal > 0 ? Math.round((baseScore / baseTotal) * 100) : 0;
  const nextQuest = baseQuests.find((quest) => quest.status !== "completed");
  return {
    score: baseScore + bonus,
    baseTotal,
    percent: Math.min(100, Math.max(0, percent)),
    bonus,
    nextQuest: nextQuest
      ? { id: nextQuest.id, title: nextQuest.title, weight: nextQuest.weight }
      : undefined,
  };
}

function buildProgressSnapshot(
  quests: QuestSnapshot[],
  updatedAt: string,
): QuestProgressFile {
  const entries: Record<string, QuestProgressRecord> = {};
  for (const quest of quests) {
    entries[quest.id] = {
      status: quest.status,
      completedAt: quest.status === "completed" ? updatedAt : undefined,
      updatedAt,
    };
  }
  return {
    version: QUEST_PROGRESS_VERSION,
    updatedAt,
    quests: entries,
  };
}

function sortQuests(a: QuestSnapshot, b: QuestSnapshot): number {
  const aIdx = QUEST_ORDER.indexOf(a.id);
  const bIdx = QUEST_ORDER.indexOf(b.id);
  if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
  if (aIdx !== -1) return -1;
  if (bIdx !== -1) return 1;
  return a.title.localeCompare(b.title);
}

export async function resolveQuestState(params: {
  identityConfigured: boolean;
  capabilities: CapabilityStatusEntry[];
  credentials: CredentialIndex;
  workspaceDir?: string;
  includeSecrets?: boolean;
}): Promise<QuestState> {
  const workspaceDir = params.workspaceDir ?? resolveWorkspaceDir();
  const autoCompletion = await computeQuestAutoCompletion({
    identityConfigured: params.identityConfigured,
    capabilities: params.capabilities,
    credentials: params.credentials,
    workspaceDir,
  });

  const now = new Date().toISOString();
  const quests: QuestSnapshot[] = QUEST_CATALOG.filter(
    (quest) => params.includeSecrets || quest.path !== "secret",
  ).map((quest) => {
    const autoCompleted = Boolean(autoCompletion[quest.id]);
    const status: QuestStatus = autoCompleted ? "completed" : "not_started";
    return {
      ...quest,
      status,
      autoCompleted,
    };
  });

  quests.sort(sortQuests);
  const power = computePower(quests);
  const progress = buildProgressSnapshot(quests, now);
  progress.note = PROGRESS_NOTE;

  return { quests, progress, power };
}

export async function startQuest(questId: string): Promise<QuestProgressFile> {
  const now = new Date().toISOString();
  return {
    version: QUEST_PROGRESS_VERSION,
    updatedAt: now,
    quests: {
      [questId]: {
        status: "in_progress",
        startedAt: now,
        updatedAt: now,
      },
    },
    note: PROGRESS_NOTE,
  };
}

export function getQuestCatalog(): QuestDefinition[] {
  return [...QUEST_CATALOG];
}
