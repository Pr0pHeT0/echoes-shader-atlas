type BreadcrumbsProps = {
  current: string;
  floating?: boolean;
};

export function Breadcrumbs({ current, floating = false }: BreadcrumbsProps) {
  return (
    <nav
      className={`breadcrumbs${floating ? " breadcrumbs--floating" : ""}`}
      aria-label="Breadcrumb"
    >
      <ol>
        <li><a href="/">Echoes Shaders</a></li>
        <li aria-hidden="true">/</li>
        <li aria-current="page">{current}</li>
      </ol>
    </nav>
  );
}
