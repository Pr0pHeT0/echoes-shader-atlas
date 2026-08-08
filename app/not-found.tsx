import type { Metadata } from "next";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";

export const metadata: Metadata = {
  title: "Shader Study Not Found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="site-shell" id="top">
      <SiteHeader />
      <main className="not-found">
        <span className="section-kicker">404 / Unclassified signal</span>
        <h1>This shader is not in the collection.</h1>
        <p>The requested study may have moved, or it is not part of the six open-source studies.</p>
        <a className="primary-link" href="/">
          Return to the index <span aria-hidden="true">→</span>
        </a>
      </main>
      <SiteFooter />
    </div>
  );
}
