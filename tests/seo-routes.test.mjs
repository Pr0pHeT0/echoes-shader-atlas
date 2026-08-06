import assert from "node:assert/strict";
import test from "node:test";

import { EFFECT_IDS } from "../scripts/audit-extraction.mjs";

const SITE_ORIGIN = "https://shader.echoes.art";
const publicPaths = [
  "/",
  "/about",
  "/privacy",
  ...EFFECT_IDS.map((id) => `/effects/${id}`),
];

let workerPromise;

async function worker() {
  if (!workerPromise) {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("seo-test", `${process.pid}-${Date.now()}`);
    workerPromise = import(workerUrl.href).then(({ default: builtWorker }) => builtWorker);
  }
  return workerPromise;
}

async function fetchRoute(pathname, accept) {
  const builtWorker = await worker();
  const headers = new Headers({ "user-agent": "EchoesSeoTestBot/1.0" });
  if (accept) headers.set("accept", accept);
  return builtWorker.fetch(
    new Request(new URL(pathname, "http://untrusted-preview.local"), {
      headers,
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

function expectedUrl(pathname) {
  return new URL(pathname, SITE_ORIGIN).toString();
}

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((match) => [
      match[1].toLowerCase(),
      match[2],
    ]),
  );
}

function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((match) => attributes(match[0]));
}

function canonicalFrom(html) {
  return tags(html, "link").find((tag) => tag.rel?.toLowerCase() === "canonical")?.href;
}

function assertCanonical(actual, pathname) {
  assert.ok(actual, `missing canonical link for ${pathname}`);
  const canonical = new URL(actual);
  const expected = new URL(pathname, SITE_ORIGIN);
  assert.equal(canonical.origin, expected.origin);
  assert.equal(canonical.pathname, expected.pathname);
  assert.equal(canonical.search, "");
  assert.equal(canonical.hash, "");
}

function jsonLdFrom(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => attributes(match[1]).type?.toLowerCase() === "application/ld+json")
    .map((match) => JSON.parse(match[2]));
}

function graphEntities(jsonLd) {
  return jsonLd.flatMap((value) => (Array.isArray(value?.["@graph"]) ? value["@graph"] : [value]));
}

function textContent(value) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function headFrom(html) {
  return html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
}

test("every indexable HTML route uses the stable production canonical origin", async (t) => {
  for (const pathname of publicPaths) {
    await t.test(pathname, async () => {
      const response = await fetchRoute(pathname, "text/html");
      assert.equal(response.status, 200);
      const html = await response.text();
      assertCanonical(canonicalFrom(html), pathname);
      assert.doesNotMatch(html, /untrusted-preview\.local/i);
    });
  }
});

test("robots.txt permits indexing and points crawlers at the production sitemap", async () => {
  const response = await fetchRoute("/robots.txt", "text/plain");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/plain\b/i);
  const body = await response.text();
  assert.match(body, /^User-Agent:\s*\*/im);
  assert.match(body, /^Allow:\s*\/$/im);
  assert.match(body, new RegExp(`^Sitemap:\\s*${SITE_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/sitemap\\.xml$`, "im"));
});

test("sitemap.xml enumerates home, policy, provenance, and all five effect permalinks", async () => {
  const response = await fetchRoute("/sitemap.xml", "application/xml");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /(?:application|text)\/xml/i);
  const xml = await response.text();
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(new Set(locations), new Set(publicPaths.map(expectedUrl)));
  assert.equal(locations.length, publicPaths.length);
});

test("web app manifest describes the production atlas and is linked from HTML", async () => {
  const [manifestResponse, homeResponse] = await Promise.all([
    fetchRoute("/manifest.webmanifest", "application/manifest+json"),
    fetchRoute("/", "text/html"),
  ]);
  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.headers.get("content-type") ?? "", /(?:manifest|json)/i);
  const manifest = await manifestResponse.json();
  assert.match(manifest.name, /Echoes Shader Atlas/i);
  assert.ok(typeof manifest.short_name === "string" && manifest.short_name.length > 0);
  assert.equal(manifest.start_url, "/");
  assert.ok(["standalone", "minimal-ui"].includes(manifest.display));
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);

  const html = await homeResponse.text();
  const manifestLink = tags(html, "link").find((tag) => tag.rel?.toLowerCase() === "manifest");
  assert.ok(manifestLink, "the root layout should link the web manifest");
  assert.equal(new URL(manifestLink.href, SITE_ORIGIN).pathname, "/manifest.webmanifest");
});

test("each effect permalink emits canonical SoftwareSourceCode and breadcrumb JSON-LD", async (t) => {
  for (const effectId of EFFECT_IDS) {
    await t.test(effectId, async () => {
      const pathname = `/effects/${effectId}`;
      const response = await fetchRoute(pathname, "text/html");
      assert.equal(response.status, 200);
      const html = await response.text();
      const documents = jsonLdFrom(html);
      assert.ok(documents.length > 0, "effect pages should include structured data");
      const entities = graphEntities(documents);
      const sourceCode = entities.find((entity) => entity?.["@type"] === "SoftwareSourceCode");
      const breadcrumbs = entities.find((entity) => entity?.["@type"] === "BreadcrumbList");
      assert.ok(sourceCode, "effect JSON-LD should describe its source code");
      assert.equal(sourceCode.url, expectedUrl(pathname));
      assert.ok(typeof sourceCode.name === "string" && sourceCode.name.length > 0);
      assert.equal(sourceCode.version, "1.0.0");
      assert.equal(sourceCode.identifier?.name, "Original artifact source commit");
      assert.match(sourceCode.identifier?.value ?? "", /^[0-9a-f]{40}$/);
      assert.equal(sourceCode.isAccessibleForFree, true);
      assert.ok(breadcrumbs, "effect JSON-LD should include navigation breadcrumbs");
      assert.ok(Array.isArray(breadcrumbs.itemListElement));
      assert.equal(breadcrumbs.itemListElement.at(-1)?.item, expectedUrl(pathname));
    });
  }
});

test("public routes keep unique, search-focused metadata inside head", async () => {
  const seenTitles = new Set();
  const seenDescriptions = new Set();

  for (const pathname of publicPaths) {
    const response = await fetchRoute(pathname, "text/html");
    const html = await response.text();
    const head = headFrom(html);
    const title = textContent(head.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const description = tags(head, "meta").find((tag) => tag.name?.toLowerCase() === "description")?.content;
    const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => textContent(match[1]));

    assert.ok(title.length >= 29 && title.length <= 60, `${pathname} title length: ${title.length}`);
    assert.ok(description, `${pathname} is missing a meta description in head`);
    assert.ok(description.length >= 145 && description.length <= 160, `${pathname} description length: ${description.length}`);
    assert.equal(h1.length, 1, `${pathname} should have exactly one H1`);
    assert.equal(seenTitles.has(title), false, `duplicate title: ${title}`);
    assert.equal(seenDescriptions.has(description), false, `duplicate description: ${description}`);
    seenTitles.add(title);
    seenDescriptions.add(description);
  }
});

test("homepage and effect pages expose search intent and descriptive internal links", async () => {
  const homeHtml = await (await fetchRoute("/", "text/html")).text();
  const homeH1 = textContent(homeHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  assert.match(homeH1, /open-source/i);
  assert.match(homeH1, /Three\.js shaders/i);
  assert.doesNotMatch(homeH1, /^Aurora Field$/i);

  for (const effectId of EFFECT_IDS) {
    const html = await (await fetchRoute(`/effects/${effectId}`, "text/html")).text();
    assert.match(html, /aria-label=["']Breadcrumb["']/i);
    assert.match(html, /Pipeline, step by step/i);
    assert.match(html, /Extraction manifest/i);
    const effectLinks = [...html.matchAll(/<a\b[^>]*href=["']\/effects\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .filter((match) => match[1] !== effectId);
    assert.ok(new Set(effectLinks.map((match) => match[1])).size >= 2, `${effectId} needs two related effect links`);
    assert.ok(effectLinks.every((match) => /shader|Three\.js/i.test(textContent(match[2]))));
  }
});

test("not-found responses emit one unambiguous noindex policy", async () => {
  const response = await fetchRoute("/effects/not-a-real-shader", "text/html");
  assert.equal(response.status, 404);
  const html = await response.text();
  const robotTokens = tags(headFrom(html), "meta")
    .filter((tag) => tag.name?.toLowerCase() === "robots")
    .flatMap((tag) => (tag.content ?? "").toLowerCase().split(",").map((token) => token.trim()));
  assert.ok(robotTokens.includes("noindex"));
  assert.equal(robotTokens.includes("index"), false);
});

test("sitemap entries include an accurate non-future modification date", async () => {
  const response = await fetchRoute("/sitemap.xml", "application/xml");
  const xml = await response.text();
  const modified = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1]);
  assert.equal(modified.length, publicPaths.length);
  for (const value of modified) {
    const date = new Date(value);
    assert.equal(Number.isNaN(date.valueOf()), false);
    assert.ok(date <= new Date());
  }
});
