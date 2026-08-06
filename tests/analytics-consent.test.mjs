import assert from "node:assert/strict";
import test from "node:test";

function createStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function installBrowserGlobals(windowValue) {
  const previous = {
    hasWindow: Object.hasOwn(globalThis, "window"),
    window: globalThis.window,
    hasDocument: Object.hasOwn(globalThis, "document"),
    document: globalThis.document,
    hasCustomEvent: Object.hasOwn(globalThis, "CustomEvent"),
    CustomEvent: globalThis.CustomEvent,
  };
  globalThis.window = windowValue;
  globalThis.document = { cookie: "" };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type) {
      this.type = type;
    }
  };

  return () => {
    if (previous.hasWindow) globalThis.window = previous.window;
    else delete globalThis.window;
    if (previous.hasDocument) globalThis.document = previous.document;
    else delete globalThis.document;
    if (previous.hasCustomEvent) globalThis.CustomEvent = previous.CustomEvent;
    else delete globalThis.CustomEvent;
  };
}

async function configuredAnalytics() {
  const previousMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-ECHOES-TEST";
  const moduleUrl = new URL("../lib/analytics.ts", import.meta.url);
  moduleUrl.searchParams.set("configured-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const analytics = await import(moduleUrl.href);
  if (previousMeasurementId === undefined) delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  else process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = previousMeasurementId;
  return analytics;
}

test("analytics helpers are inert and SSR-safe without browser globals", async () => {
  const analytics = await configuredAnalytics();
  const hadWindow = Object.hasOwn(globalThis, "window");
  const priorWindow = globalThis.window;
  delete globalThis.window;
  try {
    assert.equal(analytics.getAnalyticsConsent(), null);
    assert.doesNotThrow(() => analytics.setAnalyticsConsent("granted"));
    assert.doesNotThrow(() => analytics.disableAnalytics());
    assert.doesNotThrow(() => analytics.ensureGoogleTagQueue());
    assert.doesNotThrow(() => analytics.trackEvent("effect_select", { effect: "aurora-field" }));
  } finally {
    if (hadWindow) globalThis.window = priorWindow;
  }
});

test("the Google tag queue uses the canonical arguments object", async () => {
  const analytics = await configuredAnalytics();
  const browser = {};
  const restore = installBrowserGlobals(browser);

  try {
    analytics.ensureGoogleTagQueue();
    browser.gtag("config", "G-ECHOES-TEST", { send_page_view: true });

    assert.equal(browser.dataLayer.length, 1);
    assert.equal(Array.isArray(browser.dataLayer[0]), false, "rest-parameter arrays are not valid gtag commands");
    assert.equal(Object.prototype.toString.call(browser.dataLayer[0]), "[object Arguments]");
    assert.deepEqual(Array.from(browser.dataLayer[0]), [
      "config",
      "G-ECHOES-TEST",
      { send_page_view: true },
    ]);
  } finally {
    restore();
  }
});

test("consent persists valid choices, clears reset choices, and announces updates", async () => {
  const analytics = await configuredAnalytics();
  const localStorage = createStorage();
  const dispatched = [];
  const restore = installBrowserGlobals({
    localStorage,
    location: { hostname: "shader.echoes.art" },
    dispatchEvent: (event) => dispatched.push(event.type),
  });

  try {
    assert.ok(analytics.ANALYTICS_CONSENT_KEY.length > 0);
    assert.ok(analytics.ANALYTICS_CONSENT_EVENT.length > 0);
    assert.equal(analytics.getAnalyticsConsent(), null);

    analytics.setAnalyticsConsent("granted");
    assert.equal(localStorage.values.get(analytics.ANALYTICS_CONSENT_KEY), "granted");
    assert.equal(analytics.getAnalyticsConsent(), "granted");
    assert.equal(dispatched.at(-1), analytics.ANALYTICS_CONSENT_EVENT);

    analytics.setAnalyticsConsent("denied");
    assert.equal(analytics.getAnalyticsConsent(), "denied");
    analytics.setAnalyticsConsent(null);
    assert.equal(localStorage.values.has(analytics.ANALYTICS_CONSENT_KEY), false);
    assert.equal(analytics.getAnalyticsConsent(), null);

    localStorage.values.set(analytics.ANALYTICS_CONSENT_KEY, "unexpected-value");
    assert.equal(analytics.getAnalyticsConsent(), null, "unknown stored values fail closed");
  } finally {
    restore();
  }
});

test("events require configured, granted, and enabled analytics", async () => {
  const analytics = await configuredAnalytics();
  const localStorage = createStorage();
  const calls = [];
  const browser = {
    localStorage,
    location: { hostname: "shader.echoes.art" },
    dispatchEvent: () => {},
    gtag: (...args) => calls.push(args),
    __echoesAnalyticsEnabled: false,
  };
  const restore = installBrowserGlobals(browser);

  try {
    assert.equal(analytics.GA_MEASUREMENT_ID, "G-ECHOES-TEST");
    assert.equal(analytics.getAnalyticsMeasurementId(), "G-ECHOES-TEST");
    analytics.configureAnalytics("  G-RUNTIME-CONFIG  ");
    assert.equal(analytics.getAnalyticsMeasurementId(), "G-RUNTIME-CONFIG");
    analytics.trackEvent("effect_select", { effect_slug: "aurora-field" });
    assert.equal(calls.length, 0, "events stay blocked before consent");

    analytics.setAnalyticsConsent("granted");
    analytics.trackEvent("effect_select", { effect_slug: "aurora-field" });
    assert.equal(calls.length, 0, "consent alone does not bypass tag initialization");

    browser.__echoesAnalyticsEnabled = true;
    analytics.trackEvent("effect_select", {
      effect_slug: "aurora-field",
      card_index: 0,
      unused: undefined,
    });
    assert.deepEqual(calls.at(-1), ["event", "effect_select", {
      event_category: "shader_atlas",
      effect_slug: "aurora-field",
      card_index: 0,
    }]);

    const eventCallCount = calls.length;
    analytics.setAnalyticsConsent("denied");
    analytics.trackEvent("effect_select", { effect_slug: "voice-wave-particles" });
    assert.equal(calls.length, eventCallCount, "denied consent suppresses later events");
  } finally {
    restore();
  }
});

test("revocation disables GA and storage failures retain the visitor choice in memory", async () => {
  const analytics = await configuredAnalytics();
  const calls = [];
  const browser = {
    localStorage: {
      getItem: () => { throw new Error("storage blocked"); },
      setItem: () => { throw new Error("storage blocked"); },
      removeItem: () => { throw new Error("storage blocked"); },
    },
    location: { hostname: "shader.echoes.art" },
    dispatchEvent: () => {},
    gtag: (...args) => calls.push(args),
    __echoesAnalyticsEnabled: true,
  };
  const restore = installBrowserGlobals(browser);

  try {
    analytics.setAnalyticsConsent("granted");
    assert.equal(analytics.getAnalyticsConsent(), "granted");
    analytics.disableAnalytics();
    assert.equal(browser.__echoesAnalyticsEnabled, false);
    assert.equal(browser[`ga-disable-${analytics.GA_MEASUREMENT_ID}`], true);
    assert.deepEqual(calls.at(-1), ["consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      personalization_storage: "denied",
    }]);
  } finally {
    restore();
  }
});
