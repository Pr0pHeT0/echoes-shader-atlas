export type AnalyticsConsent = "granted" | "denied" | null;

export type AnalyticsEventName =
  | "catalog_filter"
  | "effect_select"
  | "local_model_import"
  | "playback_change"
  | "preset_change"
  | "quality_change"
  | "renderer_change"
  | "source_copy"
  | "source_tab_select"
  | "study_open"
  | "synthetic_audio_mode"
  | "target_change";

export type AnalyticsEventParameters = Record<
  string,
  string | number | boolean | null | undefined
>;

export const ANALYTICS_CONSENT_KEY = "echoes.analytics-consent.v1";
export const ANALYTICS_CONSENT_EVENT = "echoes:analytics-consent";
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";

let volatileConsent: AnalyticsConsent = null;
let configuredMeasurementId = GA_MEASUREMENT_ID;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __echoesAnalyticsEnabled?: boolean;
    __echoesAnalyticsInitialized?: boolean;
  }
}

/** Install Google's canonical queue shim without loading the remote tag. */
export function ensureGoogleTagQueue(): ((...args: unknown[]) => void) | null {
  if (typeof window === "undefined") return null;

  window.dataLayer ??= [];
  window.gtag ??= function gtag() {
    // Google expects the function's array-like `arguments` object, not a rest-parameter array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  return window.gtag;
}

function parseConsent(value: string | null): AnalyticsConsent {
  return value === "granted" || value === "denied" ? value : null;
}

export function configureAnalytics(measurementId: string): void {
  configuredMeasurementId = measurementId.trim();
}

export function getAnalyticsMeasurementId(): string {
  return configuredMeasurementId;
}

export function getAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === "undefined") return null;

  try {
    const stored = parseConsent(window.localStorage.getItem(ANALYTICS_CONSENT_KEY));
    volatileConsent = stored;
    return stored;
  } catch {
    return volatileConsent;
  }
}

export function setAnalyticsConsent(consent: AnalyticsConsent): void {
  if (typeof window === "undefined") return;

  volatileConsent = consent;
  try {
    if (consent === null) {
      window.localStorage.removeItem(ANALYTICS_CONSENT_KEY);
    } else {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, consent);
    }
  } catch {
    // The in-memory value still lets the visitor make a choice when storage is unavailable.
  }

  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT));
}

function analyticsCookieNames(): string[] {
  if (typeof document === "undefined") return [];
  return document.cookie
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter((name) => name === "_ga" || name.startsWith("_ga_"));
}

function cookieDomains(hostname: string): string[] {
  const labels = hostname.split(".").filter(Boolean);
  const domains = new Set<string>([hostname, `.${hostname}`]);

  for (let index = 1; index < labels.length - 1; index += 1) {
    const parent = labels.slice(index).join(".");
    domains.add(parent);
    domains.add(`.${parent}`);
  }

  return [...domains];
}

export function disableAnalytics(measurementId = getAnalyticsMeasurementId()): void {
  if (typeof window === "undefined") return;

  if (measurementId) {
    (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = true;
  }
  window.__echoesAnalyticsEnabled = false;
  window.gtag?.("consent", "update", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    personalization_storage: "denied",
  });

  if (typeof document === "undefined") return;
  const expires = "Thu, 01 Jan 1970 00:00:00 GMT";
  const names = analyticsCookieNames();
  const domains = cookieDomains(window.location.hostname);

  for (const name of names) {
    document.cookie = `${name}=; expires=${expires}; path=/; SameSite=Lax`;
    for (const domain of domains) {
      document.cookie = `${name}=; expires=${expires}; path=/; domain=${domain}; SameSite=Lax`;
    }
  }
}

export function trackEvent(
  name: AnalyticsEventName,
  parameters: AnalyticsEventParameters = {},
): void {
  if (
    typeof window === "undefined"
    || !getAnalyticsMeasurementId()
    || getAnalyticsConsent() !== "granted"
    || !window.__echoesAnalyticsEnabled
    || !window.gtag
  ) {
    return;
  }

  const safeParameters = Object.fromEntries(
    Object.entries(parameters).filter(([, value]) => value !== undefined),
  );

  window.gtag("event", name, {
    event_category: "shader_atlas",
    ...safeParameters,
  });
}
