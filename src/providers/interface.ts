export interface ProviderConfig {
  [key: string]: unknown;
}

export interface RemoteResource {
  id: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface MutateOperation {
  type: "create" | "update" | "delete";
  resourceType: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
}

export interface MutateResult {
  success: boolean;
  resourceId?: string;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

export interface Diff {
  changes: Array<{ path: string; oldValue: unknown; newValue: unknown }>;
}

export interface ResourceConfig {
  [key: string]: unknown;
}

export interface PlatformPayload {
  [key: string]: unknown;
}

export interface Provider {
  name: string;

  authenticate(config: ProviderConfig): Promise<void>;

  get(resourceType: string, remoteId: string): Promise<RemoteResource | null>;
  create(
    resourceType: string,
    desired: ResourceConfig,
  ): Promise<RemoteResource>;
  update(
    resourceType: string,
    remoteId: string,
    changes: Diff,
  ): Promise<RemoteResource>;
  delete(resourceType: string, remoteId: string): Promise<void>;

  batchMutate?(operations: MutateOperation[]): Promise<MutateResult[]>;

  validateResource(
    resourceType: string,
    config: ResourceConfig,
  ): ValidationResult;

  mapConfig(resourceType: string, config: ResourceConfig): PlatformPayload;
}
