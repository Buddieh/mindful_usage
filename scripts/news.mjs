// Collects recent headlines from official energy and environment sources into
// news/news.json, which the build turns into the "News" panel on the home page.
// Runs in the deploy workflow once a day. A source that fails is skipped, so the
// panel shows whatever could be read; with no file at all, the panel is left out.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./tips.mjs";

const UA = { "user-agent": "Mozilla/5.0 (Energy Ladder news panel; +https://github.com/Buddieh/mindful_usage)" };
const MAX_AGE_DAYS = 365;
const PER_SOURCE = 6;

const MONTHS = {
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6, juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
};

const decode = (s) => s
  .replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&rsquo;/g, "’").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const abs = (href, base) => new URL(decode(href), base).href;

// Each parser takes a page and returns [{ title, url, date: "YYYY-MM-DD" }].
const parsers = {
  // RSS 2.0 (Homegrade, wallonie.be).
  rss(html) {
    return [...html.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(([b]) => ({
      title: decode(b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""),
      url: decode(b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || ""),
      date: new Date(b.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || NaN),
    })).map((x) => ({ ...x, date: isNaN(x.date) ? null : x.date.toISOString().slice(0, 10) }));
  },
  // CREG news list: <article> teasers with a link, an <h3> and a <time datetime>.
  creg(html, base) {
    return [...html.matchAll(/<article class="node--news[\s\S]*?<\/article>/gi)].map(([b]) => ({
      title: decode(b.match(/<h3>([\s\S]*?)<\/h3>/i)?.[1] || ""),
      url: abs(b.match(/href="([^"]+)"/i)?.[1] || "", base),
      date: b.match(/datetime="(\d{4}-\d\d-\d\d)/i)?.[1],
    }));
  },
  // VMM news list: a teaser link holding an <h3 class="… headline"> and a <time dateTime>.
  vmm(html, base) {
    return [...html.matchAll(/<a [^>]*href="(\/nieuws\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
      .filter(([, , b]) => /headline/.test(b))
      .map(([, href, b]) => ({
        title: decode(b.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || ""),
        url: abs(href, base),
        date: b.match(/dateTime="(\d{4}-\d\d-\d\d)/i)?.[1],
      }));
  },
  // VEKA on vlaanderen.be: spotlight cards with a title link and "Nieuwsbericht • 13 oktober 2026".
  veka(html, base) {
    return [...html.matchAll(/<article role="none" class="vl-spotlight__main">([\s\S]*?)<\/article>/gi)].map(([, b]) => {
      const a = b.match(/<a href="([^"]+)"[^>]*>[\s\S]*?<span class="wp-pt-spotlight__title"><span>([\s\S]*?)<\/span>/i);
      const d = b.match(/Nieuwsbericht\s*•\s*(\d{1,2}) ([a-z]+) (\d{4})/i);
      return {
        title: decode(a?.[2] || ""),
        url: a ? abs(a[1], base) : "",
        date: d && MONTHS[d[2].toLowerCase()] ? iso(d[3], MONTHS[d[2].toLowerCase()], d[1]) : null,
      };
    });
  },
  // Brugel home page: "<span>02.10.2026</span>" followed by the news link.
  brugel(html, base) {
    const tab = html.split('id="act"')[1]?.split('id="cons"')[0] || "";
    return [...tab.matchAll(/<span>(\d\d)\.(\d\d)\.(\d{4})<\/span>[\s\S]*?<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map(([, d, m, y, href, title]) => ({ title: decode(title), url: abs(href, base), date: iso(y, m, d) }));
  },
  // energie.wallonie.be home page: news cards (not events) with a title attribute and a <time>.
  wallonie(html, base) {
    return [...html.matchAll(/<a href="([^"]+)" class="cta cta--news" title="[^":]*:\s*([^"]+)"[\s\S]*?<time datetime="(\d{4}-\d\d-\d\d)"/gi)]
      .map(([, href, title, date]) => ({ title: decode(title), url: abs(href, base), date }));
  },
};

// region: which readers see the source ("BE" = every region). lang: the language it is written in.
// Sources in two languages are listed once per language with the same id, so the page can show one version.
const ENERGY = /énergi|électri|gaz|chauff|rénov|isol|PEB|solaire|photovolt|\bprimes?\b|climat|mazout|pompe à chaleur|logement/i;
export const SOURCES = [
  { id: "creg", name: "CREG", region: "BE", lang: "nl", url: "https://www.creg.be/nl/nieuws", parse: "creg" },
  { id: "creg", name: "CREG", region: "BE", lang: "fr", url: "https://www.creg.be/fr/actualites", parse: "creg" },
  { id: "veka", name: "VEKA", region: "BE-VLG", lang: "nl", url: "https://www.vlaanderen.be/veka", parse: "veka" },
  { id: "vmm", name: "VMM", region: "BE-VLG", lang: "nl", url: "https://vmm.vlaanderen.be/nieuws", parse: "vmm" },
  { id: "homegrade", name: "Homegrade", region: "BE-BRU", lang: "fr", url: "https://homegrade.brussels/feed/", parse: "rss" },
  { id: "homegrade", name: "Homegrade", region: "BE-BRU", lang: "nl", url: "https://homegrade.brussels/nl/feed/", parse: "rss" },
  { id: "brugel", name: "Brugel", region: "BE-BRU", lang: "fr", url: "https://brugel.brussels/", parse: "brugel" },
  { id: "brugel", name: "Brugel", region: "BE-BRU", lang: "nl", url: "https://brugel.brussels/nl_BE", parse: "brugel" },
  { id: "spw-energie", name: "SPW Énergie", region: "BE-WAL", lang: "fr", url: "https://energie.wallonie.be/home.html", parse: "wallonie" },
  // General news of the Walloon government; only energy and housing items are kept.
  { id: "wallonie", name: "Wallonie.be", region: "BE-WAL", lang: "fr", url: "https://www.wallonie.be/actualites/rss", parse: "rss", keep: ENERGY },
];

async function collect(source) {
  const r = await fetch(source.url, { headers: UA, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 864e5).toISOString().slice(0, 10);
  const seen = new Set();
  const items = parsers[source.parse](html, r.url)
    .filter((x) => x.title && /^https?:\/\//.test(x.url) && x.date && x.date >= cutoff)
    .filter((x) => !source.keep || source.keep.test(x.title))
    .filter((x) => !seen.has(x.url) && seen.add(x.url))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, PER_SOURCE);
  if (!items.length) throw new Error("no dated headlines found (page layout may have changed)");
  return items.map((x) => ({ source: source.id, name: source.name, region: source.region, lang: source.lang, ...x }));
}

const report = [];
const items = [];
for (const s of SOURCES) {
  try {
    const got = await collect(s);
    items.push(...got);
    report.push({ source: s.id, lang: s.lang, ok: true, items: got.length });
    console.log(`✓ ${s.name} (${s.lang}): ${got.length}`);
    for (const x of got) console.log(`    ${x.date}  ${x.title}`);
  } catch (e) {
    report.push({ source: s.id, lang: s.lang, ok: false, error: String(e.cause?.code || e.message) });
    console.log(`✗ ${s.name} (${s.lang}): ${e.cause?.code || e.message}`);
  }
}
items.sort((a, b) => b.date.localeCompare(a.date));
mkdirSync(join(ROOT, "news"), { recursive: true });
writeFileSync(join(ROOT, "news", "news.json"), JSON.stringify({ fetched: new Date().toISOString(), sources: report, items }, null, 2) + "\n");
console.log(`${items.length} headlines written to news/news.json`);
