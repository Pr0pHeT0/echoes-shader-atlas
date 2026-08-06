"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  ANALYTICS_CONSENT_EVENT,
  ANALYTICS_CONSENT_KEY,
  configureAnalytics,
  disableAnalytics,
  getAnalyticsConsent,
  setAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/analytics";
import styles from "./GoogleAnalytics.module.css";

const GOOGLE_TAG_SCRIPT_ID = "echoes-google-analytics";

function subscribeToConsent(onStoreChange: () => void): () => void {
  function handleStorage(event: StorageEvent) {
    if (event.key === ANALYTICS_CONSENT_KEY) onStoreChange();
  }

  window.addEventListener(ANALYTICS_CONSENT_EVENT, onStoreChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(ANALYTICS_CONSENT_EVENT, onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function useAnalyticsConsent(): AnalyticsConsent {
  return useSyncExternalStore(subscribeToConsent, getAnalyticsConsent, () => null);
}

function enableGoogleAnalytics(measurementId: string): void {
  if (!measurementId || typeof window === "undefined") return;

  (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = false;
  window.dataLayer ??= [];
  window.gtag ??= (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };

  if (!window.__echoesAnalyticsInitialized) {
    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      personalization_storage: "denied",
      functionality_storage: "granted",
      security_storage: "granted",
    });
    window.gtag("js", new Date());
    window.__echoesAnalyticsInitialized = true;
  }

  window.gtag("consent", "update", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    personalization_storage: "denied",
  });

  if (!window.__echoesAnalyticsEnabled) {
    window.__echoesAnalyticsEnabled = true;
    window.gtag("config", measurementId, {
      allow_ad_personalization_signals: false,
      allow_google_signals: false,
      anonymize_ip: true,
      send_page_view: true,
    });
  }

  if (!document.getElementById(GOOGLE_TAG_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = GOOGLE_TAG_SCRIPT_ID;
    script.async = true;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }
}

export function GoogleAnalyticsClient({ measurementId }: { measurementId: string }) {
  const consent = useAnalyticsConsent();

  useEffect(() => {
    configureAnalytics(measurementId);
    if (!measurementId) return;
    if (consent === "granted") {
      enableGoogleAnalytics(measurementId);
    } else {
      disableAnalytics(measurementId);
    }
  }, [consent, measurementId]);

  if (!measurementId || consent !== null) return null;

  return (
    <aside className={styles.banner} aria-label="Analytics preferences">
      <span className={styles.label}>Optional analytics</span>
      <p className={styles.copy}>
        Help improve the site by allowing limited Google Analytics usage data. The tag stays
        unloaded unless you accept. <a href="/privacy">Read the privacy details</a>.
      </p>
      <div className={styles.actions}>
        <button
          className={`${styles.button} ${styles.primary}`}
          type="button"
          onClick={() => setAnalyticsConsent("granted")}
        >
          Accept analytics
        </button>
        <button
          className={styles.button}
          type="button"
          onClick={() => {
            setAnalyticsConsent("denied");
            disableAnalytics(measurementId);
          }}
        >
          Decline
        </button>
      </div>
    </aside>
  );
}

export function AnalyticsPreferencesClient({ measurementId }: { measurementId: string }) {
  const consent = useAnalyticsConsent();

  useEffect(() => {
    configureAnalytics(measurementId);
  }, [measurementId]);

  if (!measurementId) {
    return (
      <div className={styles.preferences}>
        <p className={styles.status}>Optional analytics are not configured on this deployment.</p>
      </div>
    );
  }

  const status = consent === "granted"
    ? "Optional analytics are currently allowed on this browser."
    : consent === "denied"
      ? "Optional analytics are currently disabled on this browser."
      : "You have not chosen an analytics preference on this browser.";

  return (
    <div className={styles.preferences} aria-label="Manage analytics preference">
      <p className={styles.status} role="status" aria-live="polite">{status}</p>
      <div className={styles.actions}>
        {consent !== "granted" ? (
          <button
            className={`${styles.button} ${styles.primary}`}
            type="button"
            onClick={() => setAnalyticsConsent("granted")}
          >
            Allow analytics
          </button>
        ) : (
          <button
            className={styles.button}
            type="button"
            onClick={() => {
              setAnalyticsConsent("denied");
              disableAnalytics(measurementId);
            }}
          >
            Revoke analytics
          </button>
        )}
        {consent !== null ? (
          <button
            className={styles.button}
            type="button"
            onClick={() => {
              disableAnalytics(measurementId);
              setAnalyticsConsent(null);
            }}
          >
            Ask me again
          </button>
        ) : (
          <button
            className={styles.button}
            type="button"
            onClick={() => {
              setAnalyticsConsent("denied");
              disableAnalytics(measurementId);
            }}
          >
            Keep analytics off
          </button>
        )}
      </div>
    </div>
  );
}
