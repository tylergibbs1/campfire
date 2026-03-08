import { resolve } from "path";
import { mkdir } from "fs/promises";
import { StateError } from "../util/errors.ts";

export interface ResourceState {
  remote_id: string;
  config_hash: string;
  last_synced: string;
  provider: string;
  metadata: Record<string, unknown>;
}

export interface StateFile {
  version: number;
  resources: Record<string, ResourceState>;
  lock: { owner: string; acquired: string } | null;
}

const CURRENT_VERSION = 1;

function emptyState(): StateFile {
  return {
    version: CURRENT_VERSION,
    resources: {},
    lock: null,
  };
}

export class StateManager {
  private state: StateFile | null = null;

  constructor(private statePath: string) {}

  async load(): Promise<StateFile> {
    const file = Bun.file(this.statePath);
    if (!(await file.exists())) {
      this.state = emptyState();
      return this.state;
    }

    try {
      const content = await file.json();
      this.state = content as StateFile;

      if (this.state.version !== CURRENT_VERSION) {
        this.state = this.migrate(this.state);
      }

      return this.state;
    } catch (e) {
      throw new StateError(
        `Failed to read state file at ${this.statePath}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async save(): Promise<void> {
    if (!this.state) {
      throw new StateError("No state loaded. Call load() first.");
    }

    const dir = resolve(this.statePath, "..");
    await mkdir(dir, { recursive: true });

    await Bun.write(this.statePath, JSON.stringify(this.state, null, 2) + "\n");
  }

  getState(): StateFile {
    if (!this.state) {
      throw new StateError("No state loaded. Call load() first.");
    }
    return this.state;
  }

  getResource(key: string): ResourceState | undefined {
    return this.getState().resources[key];
  }

  setResource(key: string, resource: ResourceState): void {
    this.getState().resources[key] = resource;
  }

  removeResource(key: string): void {
    delete this.getState().resources[key];
  }

  listResources(): Array<[string, ResourceState]> {
    return Object.entries(this.getState().resources);
  }

  private migrate(state: StateFile): StateFile {
    // Future: handle state version migrations
    return { ...state, version: CURRENT_VERSION };
  }
}
