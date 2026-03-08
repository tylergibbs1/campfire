import { loadWorkspace } from "../../config/parser.ts";
import { createLocalStateManager } from "../../state/backends/local.ts";
import { printStateList } from "../output.ts";
import { logger } from "../../util/logger.ts";

export async function stateListCommand(): Promise<void> {
  const workspace = await loadWorkspace();
  const statePath =
    workspace.config.workspace.state?.path ?? ".campfire/state.json";
  const stateManager = createLocalStateManager(workspace.root, statePath);
  await stateManager.load();

  printStateList(stateManager.listResources());
}

export async function stateRemoveCommand(resourceKey: string): Promise<void> {
  const workspace = await loadWorkspace();
  const statePath =
    workspace.config.workspace.state?.path ?? ".campfire/state.json";
  const stateManager = createLocalStateManager(workspace.root, statePath);
  await stateManager.load();

  const resource = stateManager.getResource(resourceKey);
  if (!resource) {
    logger.error(`Resource "${resourceKey}" not found in state.`);
    process.exit(1);
  }

  stateManager.removeResource(resourceKey);
  await stateManager.save();
  logger.success(`Removed "${resourceKey}" from state.`);
}
