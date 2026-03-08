import { Command } from "commander";
import { initCommand } from "./commands/init.ts";
import { validateCommand } from "./commands/validate.ts";
import { planCommand } from "./commands/plan.ts";
import { applyCommand } from "./commands/apply.ts";
import { destroyCommand } from "./commands/destroy.ts";
import { stateListCommand, stateRemoveCommand } from "./commands/state.ts";
import { importCommand } from "./commands/import.ts";
import { logger } from "../util/logger.ts";

const program = new Command();

program
  .name("campfire")
  .description("Terraform for ads — manage ad campaigns as code")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize a new campfire workspace")
  .action(wrapAction(initCommand));

program
  .command("validate")
  .description("Validate config syntax and references")
  .action(wrapAction(validateCommand));

program
  .command("plan")
  .description("Show what would change (dry run)")
  .action(
    wrapAction(async () => {
      const plan = await planCommand();
      const { toCreate, toUpdate, toDestroy } = plan.summary;
      if (toCreate > 0 || toUpdate > 0 || toDestroy > 0) {
        process.exit(2);
      }
    }),
  );

program
  .command("apply")
  .description("Apply changes to ad platforms")
  .option("--auto-approve", "Skip confirmation prompt")
  .action(
    wrapAction(async (opts) => {
      await applyCommand({ autoApprove: opts.autoApprove });
    }),
  );

program
  .command("destroy")
  .description("Remove all managed resources")
  .option("--auto-approve", "Skip confirmation prompt")
  .action(
    wrapAction(async (opts) => {
      await destroyCommand({ autoApprove: opts.autoApprove });
    }),
  );

program
  .command("import <type> <remote-id>")
  .description("Import existing platform resource into state")
  .action(
    wrapAction(async (type: string, remoteId: string) => {
      await importCommand(type, remoteId);
    }),
  );

const stateCmd = program
  .command("state")
  .description("Manage state");

stateCmd
  .command("list")
  .description("Show all tracked resources")
  .action(wrapAction(stateListCommand));

stateCmd
  .command("rm <resource>")
  .description("Remove a resource from state")
  .action(wrapAction(stateRemoveCommand));

function wrapAction(fn: (...args: any[]) => Promise<void>) {
  return async (...args: any[]) => {
    try {
      await fn(...args);
    } catch (e) {
      if (e instanceof Error) {
        logger.error(e.message);
        if (process.env.CAMPFIRE_DEBUG) {
          console.error(e.stack);
        }
      } else {
        logger.error(String(e));
      }
      process.exit(1);
    }
  };
}

program.parse();
