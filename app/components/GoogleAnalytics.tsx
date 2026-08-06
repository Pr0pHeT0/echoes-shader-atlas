import {
  AnalyticsPreferencesClient,
  GoogleAnalyticsClient,
} from "./GoogleAnalyticsClient";

function measurementId(): string {
  return process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
}

/** Server wrapper keeps the public GA ID available in vinext's client bundle at runtime. */
export function GoogleAnalytics() {
  return <GoogleAnalyticsClient measurementId={measurementId()} />;
}

export function AnalyticsPreferences() {
  return <AnalyticsPreferencesClient measurementId={measurementId()} />;
}
