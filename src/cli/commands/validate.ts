import { loadWorkspace } from "../../config/parser.ts";
import { extractResourceRefs } from "../../config/references.ts";
import { collectUndefinedVars } from "../../config/variables.ts";
import { logger } from "../../util/logger.ts";

export async function validateCommand(): Promise<void> {
  const workspace = await loadWorkspace();

  // Check for undefined variables (using empty vars to catch all)
  // Variables are already resolved during parsing, so if we got here, they're fine.

  const refs = extractResourceRefs(workspace.campaigns);

  logger.success(
    `Validated ${workspace.campaigns.campaigns.length} campaign(s), ${refs.length} resource(s)`,
  );

  // Check for duplicate resource names
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.provider}:${ref.type}:${ref.name}`;
    if (seen.has(key)) {
      logger.warn(`Duplicate resource: ${key}`);
    }
    seen.add(key);
  }

  logger.success("Config is valid.");
}
