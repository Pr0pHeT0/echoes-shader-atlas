type JsonLdProps = {
  data: Record<string, unknown>;
  id?: string;
};

/** Serialize trusted, server-authored structured data without allowing HTML injection. */
export function JsonLd({ data, id }: JsonLdProps) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
