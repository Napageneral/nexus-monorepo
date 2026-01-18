import fsp from "node:fs/promises";
import path from "node:path";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import {
  NEXUS_ROOT,
  SKILLS_STATE_DIR,
  WORKSPACE_SKILLS_DIR,
  resolveUserPath,
} from "../utils.js";

export type CursorRulesOptions = {
  workspaceDir?: string;
  skillsDir?: string;
  userSkillsDir?: string;
  includeAgentsMd?: boolean;
  includeBootstrap?: boolean;
  outputPath?: string;
};

/**
 * Generate and write `.cursor/rules` for a given workspace.
 *
 * Usage:
 *   nexus cursor-rules [--workspace <path>]
 */
export async function cursorRulesCommand(
  opts?: { workspace?: string },
  runtime: RuntimeEnv = defaultRuntime,
) {
  const workspaceDir = opts?.workspace?.trim() || NEXUS_ROOT;

  const resolvedWorkspace = resolveUserPath(workspaceDir);
  runtime.log(`Generating .cursor/rules for workspace: ${resolvedWorkspace}`);

  const outputPath = await writeCursorRules({
    workspaceDir: resolvedWorkspace,
    outputPath: path.join(resolvedWorkspace, ".cursor", "rules"),
    includeAgentsMd: true,
    includeBootstrap: true,
  });

  runtime.log(`✓ Wrote ${outputPath}`);
}

/**
 * Generate .cursor/rules content from Nexus skills and config
 */
export async function generateCursorRules(
  options: CursorRulesOptions = {},
): Promise<string> {
  const skillsDir = options.skillsDir || WORKSPACE_SKILLS_DIR;
  const agentsPath = path.join(NEXUS_ROOT, "AGENTS.md");

  const rules = `# Nexus Workspace - Cursor Configuration

This workspace uses Nexus. Follow the root \`AGENTS.md\` file for all protocols.

## Cursor-Specific

- Run \`nexus status\` first
- Cursor sessionStart hook injects identity context (see \`.cursor/hooks.json\`)
- Use the Shell tool for \`nexus\` commands
- Skill definitions live in \`${skillsDir}\`
- Skill state and usage logs live in \`${SKILLS_STATE_DIR}\`
- Read \`${agentsPath}\` for full instructions
`;

  return `${rules.trim()}\n`;
}

/**
 * Write cursor rules to the specified output path
 */
export async function writeCursorRules(
  options: CursorRulesOptions = {},
): Promise<string> {
  const workspaceDir = options.workspaceDir || process.cwd();
  const outputPath =
    options.outputPath || path.join(workspaceDir, ".cursor", "rules");

  const rules = await generateCursorRules(options);

  // Ensure .cursor directory exists
  const cursorDir = path.dirname(outputPath);
  await fsp.mkdir(cursorDir, { recursive: true });

  await fsp.writeFile(outputPath, rules, "utf-8");

  return outputPath;
}
