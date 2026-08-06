import { AnalyticsPreferences } from "../components/GoogleAnalytics";
import { JsonLd } from "../components/JsonLd";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { createPageMetadata, SITE_URL } from "@/lib/site";

const description =
  "How Echoes Shader Atlas handles optional analytics, local preferences, and visitor privacy.";

export const metadata = createPageMetadata({
  path: "/privacy",
  title: "Privacy",
  description,
});

const privacyStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${SITE_URL}/privacy#page`,
  url: `${SITE_URL}/privacy`,
  name: "Privacy — Echoes Shader Atlas",
  description,
  inLanguage: "en",
  isPartOf: { "@id": `${SITE_URL}/#website` },
};

export default function PrivacyPage() {
  return (
    <div className="site-shell" id="top">
      <JsonLd id="privacy-structured-data" data={privacyStructuredData} />
      <SiteHeader />

      <main className="page-main">
        <section className="about-hero" aria-labelledby="privacy-title">
          <div>
            <span className="eyebrow">Privacy / analytics choices</span>
            <h1 className="display-title" id="privacy-title">Privacy, without fine print.</h1>
          </div>
          <div>
            <p className="lead">
              The shader atlas works without accounts, uploads, microphone access, or analytics.
              Optional measurement runs only after you choose to allow it.
            </p>
            <a className="text-link" href="/">
              Return to the atlas <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>

        <div className="section-grid">
          <section className="info-panel" aria-labelledby="analytics-heading">
            <span className="section-label">01 / Optional measurement</span>
            <h2 id="analytics-heading">Google Analytics stays off by default.</h2>
            <p>
              The Google Analytics 4 tag is not downloaded until you select “Accept analytics.” If
              you decline, the atlas stores that choice locally and does not start the tag.
            </p>
            <p>
              When allowed, measurement covers route views and a small set of product interactions:
              choosing an effect, filtering the catalog, changing preview controls, selecting a
              source tab, and copying shader source.
            </p>
          </section>

          <section className="info-panel" aria-labelledby="data-heading">
            <span className="section-label">02 / Data boundaries</span>
            <h2 id="data-heading">No identity fields. No microphone data.</h2>
            <p>
              The atlas does not send names, email addresses, account identifiers, typed content,
              microphone input, or shader source to analytics. Event details are limited to fixed
              catalog labels and control choices.
            </p>
            <p>
              Google Analytics may receive ordinary technical request information and may set
              first-party cookies such as <code>_ga</code> after consent. Advertising signals and ad
              personalization are disabled in the tag configuration.
            </p>
          </section>

          <section className="info-panel" aria-labelledby="choice-heading">
            <span className="section-label">03 / Your choice</span>
            <h2 id="choice-heading">Change your preference at any time.</h2>
            <p>
              Your analytics choice is saved only in this browser’s local storage. Revoking consent
              stops further analytics events and attempts to remove Google Analytics cookies created
              for this site. Clearing browser storage may make the choice appear again.
            </p>
            <AnalyticsPreferences />
          </section>

          <section className="info-panel" aria-labelledby="provider-heading">
            <span className="section-label">04 / Provider information</span>
            <h2 id="provider-heading">Understand Google’s role.</h2>
            <p>
              Google processes analytics data as the service provider. Its documentation explains
              how Google uses information from sites and apps that use its services and offers a
              browser add-on for visitors who want an additional opt-out.
            </p>
            <p>
              <a
                className="text-link"
                href="https://policies.google.com/technologies/partner-sites"
                target="_blank"
                rel="noreferrer"
              >
                Google partner-sites policy <span aria-hidden="true">↗</span>
              </a>
            </p>
            <p>
              <a
                className="text-link"
                href="https://tools.google.com/dlpage/gaoptout"
                target="_blank"
                rel="noreferrer"
              >
                Google Analytics opt-out add-on <span aria-hidden="true">↗</span>
              </a>
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
