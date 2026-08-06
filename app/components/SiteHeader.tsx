import { SITE_GITHUB_URL } from "@/lib/site";

export function SiteHeader({ floating = false }: { floating?: boolean }) {
  return (
    <header className={`site-header${floating ? " site-header--floating" : ""}`}>
      <a className="wordmark" href="/" aria-label="Echoes Shader Atlas home">
        <span className="wordmark-mark" aria-hidden="true">
          E/
        </span>
        <span className="wordmark-copy">
          <strong>Echoes</strong>
          <small>Shader Atlas</small>
        </span>
      </a>
      <nav className="site-nav" aria-label="Primary navigation">
        <a href="/#catalog">Shader index</a>
        <a href="/about">About</a>
        <a href={SITE_GITHUB_URL} target="_blank" rel="noreferrer">
          GitHub source <span aria-hidden="true">↗</span>
        </a>
      </nav>
    </header>
  );
}
