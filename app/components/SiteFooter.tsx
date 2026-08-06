import {
  SITE_GITHUB_URL,
  SITE_LICENSE_URL,
  SITE_MAINTAINER_NAME,
  SITE_MAINTAINER_URL,
  SITE_MANIFEST_URL,
  SITE_NOTICES_URL,
  SITE_UPDATED_DATE,
} from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <span className="section-kicker">Open source / 2026</span>
        <p>
          Open-source GLSL studies with live demos, readable code, and documented Three.js runtimes. Maintained by{" "}
          <a className="inline-link" href={SITE_MAINTAINER_URL} target="_blank" rel="noreferrer">
            {SITE_MAINTAINER_NAME}
          </a>; technically verified <time dateTime={SITE_UPDATED_DATE}>August 6, 2026</time>.
        </p>
      </div>
      <div className="footer-links">
        <a href="/about">About the project</a>
        <a href="/privacy">Privacy &amp; analytics</a>
        <a href="/#catalog">All five systems</a>
        <a href={SITE_GITHUB_URL} target="_blank" rel="noreferrer">GitHub source ↗</a>
        <a href={SITE_MANIFEST_URL} target="_blank" rel="noreferrer">Extraction manifest ↗</a>
        <a href={SITE_NOTICES_URL} target="_blank" rel="noreferrer">Third-party notices ↗</a>
        <a href={SITE_LICENSE_URL} target="_blank" rel="noreferrer">MIT License ↗</a>
        <a href="#top">Back to top ↑</a>
      </div>
    </footer>
  );
}
