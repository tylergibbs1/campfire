import type { Provider } from "./interface.ts";

const providers = new Map<string, Provider>();

export function registerProvider(provider: Provider): void {
  providers.set(provider.name, provider);
}

export function getProvider(name: string): Provider | undefined {
  return providers.get(name);
}

export function listProviders(): string[] {
  return [...providers.keys()];
}
