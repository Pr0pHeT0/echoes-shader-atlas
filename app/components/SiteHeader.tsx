import Link from "next/link";

export function SiteHeader({ floating = false }: { floating?: boolean }) {
  return (
    <header className={`site-header${floating ? " site-header--floating" : ""}`}>
      <Link className="wordmark" href="/" aria-label="Echoes Shader Atlas home">
        <span className="wordmark-mark" aria-hidden="true">
          E/
        </span>
        <span className="wordmark-copy">
          <strong>Echoes</strong>
          <small>Shader Atlas</small>
        </span>
      </Link>
      <nav className="site-nav" aria-label="Primary navigation">
        <Link href="/#catalog">Index</Link>
        <Link href="/about">About</Link>
        <a href="https://opensource.org/license/mit" target="_blank" rel="noreferrer">
          MIT <span aria-hidden="true">↗</span>
        </a>
      </nav>
    </header>
  );
}
