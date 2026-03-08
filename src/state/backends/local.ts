import { resolve } from "path";
import { StateManager } from "../manager.ts";

export function createLocalStateManager(
  root: string,
  path: string,
): StateManager {
  const statePath = resolve(root, path);
  return new StateManager(statePath);
}
