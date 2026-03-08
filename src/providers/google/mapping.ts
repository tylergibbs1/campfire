/**
 * Maps campfire config values to Google Ads API format.
 */

export function toMicros(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return String(Math.round(num * 1_000_000));
}

export function fromMicros(micros: string | number): number {
  const num = typeof micros === "string" ? parseInt(micros, 10) : micros;
  return num / 1_000_000;
}

export function mapChannelType(type: string): string {
  const map: Record<string, string> = {
    search: "SEARCH",
    display: "DISPLAY",
    shopping: "SHOPPING",
    performance_max: "PERFORMANCE_MAX",
  };
  return map[type] ?? type.toUpperCase();
}

export function mapStatus(status: string): string {
  const map: Record<string, string> = {
    enabled: "ENABLED",
    paused: "PAUSED",
    removed: "REMOVED",
  };
  return map[status] ?? status.toUpperCase();
}

export function mapMatchType(matchType: string): string {
  const map: Record<string, string> = {
    broad: "BROAD",
    phrase: "PHRASE",
    exact: "EXACT",
  };
  return map[matchType] ?? matchType.toUpperCase();
}

export function mapBiddingStrategy(strategy: string): string {
  const map: Record<string, string> = {
    maximize_conversions: "MAXIMIZE_CONVERSIONS",
    maximize_conversion_value: "MAXIMIZE_CONVERSION_VALUE",
    target_cpa: "TARGET_CPA",
    target_roas: "TARGET_ROAS",
    manual_cpc: "MANUAL_CPC",
    manual_cpm: "MANUAL_CPM",
  };
  return map[strategy] ?? strategy.toUpperCase();
}

// Geo target constants for common countries
// In production you'd look these up via the GeoTargetConstantService
const GEO_TARGET_CONSTANTS: Record<string, string> = {
  US: "2840",
  CA: "2124",
  GB: "2826",
  AU: "2036",
  DE: "2276",
  FR: "2250",
  JP: "2392",
  IN: "2356",
  BR: "2076",
  MX: "2484",
  ES: "2724",
  IT: "2380",
  NL: "2528",
  SE: "2752",
  NO: "2578",
  DK: "2208",
  FI: "2246",
  NZ: "2554",
  SG: "2702",
  KR: "2410",
};

export function geoTargetConstant(countryCode: string): string | undefined {
  return GEO_TARGET_CONSTANTS[countryCode.toUpperCase()];
}

export function resourceName(
  customerId: string,
  resourceType: string,
  resourceId: string,
): string {
  return `customers/${customerId}/${resourceType}/${resourceId}`;
}

export function extractId(resourceName: string): string {
  const parts = resourceName.split("/");
  return parts[parts.length - 1] ?? "";
}
