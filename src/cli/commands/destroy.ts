import { loadWorkspace } from "../../config/parser.ts";
import { createLocalStateManager } from "../../state/backends/local.ts";
import { initProviders } from "../providers.ts";
import { logger } from "../../util/logger.ts";
import chalk from "chalk";

export async function destroyCommand(opts: {
  autoApprove?: boolean;
}): Promise<void> {
  const workspace = await loadWorkspace();
  const statePath =
    workspace.config.workspace.state?.path ?? ".campfire/state.json";
  const stateManager = createLocalStateManager(workspace.root, statePath);
  await stateManager.load();

  const resources = stateManager.listResources();
  if (resources.length === 0) {
    logger.info("No resources to destroy.");
    return;
  }

  console.log(chalk.red(`\nPlan: ${resources.length} resource(s) to destroy\n`));
  for (const [key] of resources) {
    console.log(chalk.red(`  - ${key}`));
  }
  console.log();

  if (!opts.autoApprove) {
    process.stdout.write(
      chalk.red("Do you really want to destroy all resources? (yes/no) "),
    );
    const response = await new Promise<string>((resolve) => {
      process.stdin.resume();
      process.stdin.setEncoding("utf8");
      process.stdin.once("data", (data) => {
        process.stdin.pause();
        resolve(data.toString());
      });
    });
    if (response.trim().toLowerCase() !== "yes") {
      logger.info("Destroy cancelled.");
      return;
    }
  }

  // Initialize providers for real API deletion
  const providers = await initProviders(workspace.config, workspace.root);

  // Delete in reverse order (children first)
  for (const [key, res] of resources.reverse()) {
    try {
      const provider = providers.get(res.provider);
      if (provider && !res.remote_id.startsWith("pending:")) {
        const resourceType = key.split(":")[1] ?? "";
        await provider.delete(resourceType, res.remote_id);
      }

      stateManager.removeResource(key);
      await stateManager.save();
      logger.success(`Destroyed ${key}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`Failed to destroy ${key}: ${msg}`);
    }
  }

  console.log(chalk.red(`\n${resources.length} resource(s) destroyed.\n`));
}
