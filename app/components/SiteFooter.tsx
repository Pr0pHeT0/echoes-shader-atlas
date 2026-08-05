import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <span className="section-kicker">Open source / 2026</span>
        <p>Production shaders, separated from product code and made legible.</p>
      </div>
      <div className="footer-links">
        <Link href="/about">Method &amp; provenance</Link>
        <Link href="/#catalog">All five systems</Link>
        <a href="#top">Back to top ↑</a>
      </div>
    </footer>
  );
}
