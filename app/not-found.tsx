import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";

export default function NotFound() {
  return (
    <div className="site-shell" id="top">
      <SiteHeader />
      <main className="not-found">
        <span className="section-kicker">404 / Unclassified signal</span>
        <h1>This shader is not in the atlas.</h1>
        <p>The requested study may have moved, or it was never part of the five recovered systems.</p>
        <a className="primary-link" href="/">
          Return to the index <span aria-hidden="true">→</span>
        </a>
      </main>
      <SiteFooter />
    </div>
  );
}
