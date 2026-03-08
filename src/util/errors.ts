export class CampfireError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CampfireError";
  }
}

export class ConfigError extends CampfireError {
  constructor(message: string, public filePath?: string, public line?: number) {
    super(message, "CONFIG_ERROR", { filePath, line });
    this.name = "ConfigError";
  }
}

export class StateError extends CampfireError {
  constructor(message: string) {
    super(message, "STATE_ERROR");
    this.name = "StateError";
  }
}

export class ProviderError extends CampfireError {
  constructor(
    message: string,
    public provider: string,
    public apiError?: unknown,
  ) {
    super(message, "PROVIDER_ERROR", { provider });
    this.name = "ProviderError";
  }
}

export class ValidationError extends CampfireError {
  constructor(
    message: string,
    public errors: Array<{ path: string; message: string }>,
  ) {
    super(message, "VALIDATION_ERROR", { errors });
    this.name = "ValidationError";
  }
}
