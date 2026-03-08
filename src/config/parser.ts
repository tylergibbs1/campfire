import { parse as parseYAML } from "yaml";
import { glob } from "glob";
import { resolve, dirname } from "path";
import {
  workspaceFileSchema,
  campaignFileSchema,
  varsFileSchema,
  type WorkspaceConfig,
  type CampaignFile,
  type VarsFile,
} from "./schema.ts";
import { resolveVariables, type Variables } from "./variables.ts";
import { ConfigError } from "../util/errors.ts";

export interface ParsedWorkspace {
  root: string;
  config: WorkspaceConfig;
  campaigns: CampaignFile;
  variables: Variables;
}

export async function loadWorkspace(rootDir?: string): Promise<ParsedWorkspace> {
  const root = rootDir ? resolve(rootDir) : process.cwd();
  const workspacePath = resolve(root, "campfire.yml");

  // Load workspace config
  const workspaceRaw = await readYAML(workspacePath);
  if (!workspaceRaw) {
    throw new ConfigError(
      `No campfire.yml found in ${root}. Run "campfire init" to create one.`,
      workspacePath,
    );
  }

  const workspaceResult = workspaceFileSchema.safeParse(workspaceRaw);
  if (!workspaceResult.success) {
    throw new ConfigError(
      `Invalid campfire.yml: ${workspaceResult.error.message}`,
      workspacePath,
    );
  }
  const config = workspaceResult.data;

  // Load variables
  const variables = await loadVariables(root);

  // Resolve env vars in provider config
  const resolvedConfig = resolveVariables(config, variables) as WorkspaceConfig;

  // Load campaign files
  const campaigns = await loadCampaignFiles(root, variables);

  return { root, config: resolvedConfig, campaigns, variables };
}

async function loadVariables(root: string): Promise<Variables> {
  const vars: Variables = {};
  const varFiles = await glob("vars/**/*.yml", { cwd: root });

  for (const file of varFiles) {
    const raw = await readYAML(resolve(root, file));
    if (!raw) continue;

    const result = varsFileSchema.safeParse(raw);
    if (!result.success) {
      throw new ConfigError(
        `Invalid variables file: ${result.error.message}`,
        file,
      );
    }

    Object.assign(vars, result.data.vars);
  }

  return vars;
}

async function loadCampaignFiles(
  root: string,
  variables: Variables,
): Promise<CampaignFile> {
  const files = await glob("**/*.camp.yml", { cwd: root });
  const allCampaigns: CampaignFile = { campaigns: [] };

  for (const file of files.sort()) {
    const raw = await readYAML(resolve(root, file));
    if (!raw) continue;

    // Resolve variables before validation
    const resolved = resolveVariables(raw, variables);

    const result = campaignFileSchema.safeParse(resolved);
    if (!result.success) {
      throw new ConfigError(
        `Invalid campaign file "${file}": ${result.error.message}`,
        file,
      );
    }

    allCampaigns.campaigns.push(...result.data.campaigns);
  }

  return allCampaigns;
}

async function readYAML(filePath: string): Promise<unknown | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  const content = await file.text();
  try {
    return parseYAML(content);
  } catch (e) {
    throw new ConfigError(
      `Failed to parse YAML: ${e instanceof Error ? e.message : String(e)}`,
      filePath,
    );
  }
}
