// Monthly upkeep check for variable tips.
// Re-opens every source page cited by a variable tip, fingerprints its main text and compares it
// with the fingerprints from the previous run. Writes a Markdown report listing pages that changed
// or could not be read, and the tips due for review in the coming month.
//
// Usage: node scripts/check-sources.mjs <snapshot.json> <report.md>
// The snapshot file is read if it exists and rewritten with this run's fingerprints.
// Exit code 0 always; the report's first line says whether anything needs attention.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadTips } from "./tips.mjs";

const [snapshotFile, reportFile] = process.argv.slice(2);
if (!snapshotFile || !reportFile) {
  console.error("Usage: node scripts/check-sources.mjs <snapshot.json> <report.md>");
  process.exit(2);
}

const REPO = "https://github.com/Buddieh/mindful_usage/blob/main/content/tips";
const today = new Date().toISOString().slice(0, 10);
const inAMonth = new Date(Date.now() + 31 * 864e5).toISOString().slice(0, 10);

const variable = loadTips().filter((t) => t.data.stability === "variable");
const citedBy = new Map(); // url -> tip ids
for (const tip of variable) {
  for (const s of tip.data.sources) citedBy.set(s.url, [...(citedBy.get(s.url) || []), tip.id]);
}

// Main text of an HTML page: the <main> element if there is one, without scripts, styles,
// navigation, headers, footers, forms and tags, so menus and tracking code don't count as changes.
function mainText(html) {
  const main = html.match(/<main[\s>][\s\S]*<\/main>/i)?.[0] ?? html.match(/<body[\s>][\s\S]*<\/body>/i)?.[0] ?? html;
  return main
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|nav|header|footer|form|aside)[\s>][\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fingerprint(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(30000),
        headers: { "user-agent": "mindful_usage source check (+https://github.com/Buddieh/mindful_usage)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get("content-type") || "";
      const body = Buffer.from(await res.arrayBuffer());
      const text = type.includes("html") ? mainText(body.toString("utf8")) : body;
      if (type.includes("html") && text.length < 200) throw new Error("page has almost no text");
      return { hash: createHash("sha256").update(text).digest("hex"), finalUrl: res.url };
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return { error: lastError?.message || String(lastError) };
}

const previous = existsSync(snapshotFile) ? JSON.parse(readFileSync(snapshotFile, "utf8")) : { pages: {} };
const firstRun = Object.keys(previous.pages).length === 0;
const pages = {};
const changed = [];
const failed = [];

for (const [url, ids] of citedBy) {
  const result = await fingerprint(url);
  const before = previous.pages[url];
  if (result.error) {
    failed.push({ url, ids, error: result.error });
    if (before) pages[url] = before; // keep the last good fingerprint
    continue;
  }
  pages[url] = { hash: result.hash, seen: today, ...(result.finalUrl !== url && { redirected_to: result.finalUrl }) };
  if (before && before.hash !== result.hash) changed.push({ url, ids, since: before.seen, redirected: result.finalUrl !== url && result.finalUrl });
}

writeFileSync(snapshotFile, JSON.stringify({ checked: today, pages }, null, 2) + "\n");

const due = variable
  .filter((t) => t.data.review_by <= inAMonth)
  .sort((a, b) => a.data.review_by.localeCompare(b.data.review_by));

const link = (id) => `[${id}](${REPO}/${id}.md)`;
const lines = [];
const attention = changed.length + failed.length + due.length > 0;
lines.push(attention ? "Variable tips need attention." : "Nothing to do this month.", "");
lines.push(
  `Checked ${citedBy.size} source pages cited by ${variable.length} variable tips on ${today}.` +
    (firstRun ? " This is the first run, so it only records the pages; changes are reported from next month." : ""),
  ""
);
if (changed.length) {
  lines.push("## Source pages that changed", "", "Re-read each page and update the tips that cite it, in English and Dutch. A change can be cosmetic; if so, nothing needs editing.", "");
  for (const c of changed) lines.push(`- [ ] ${c.url} (previous check ${c.since}${c.redirected ? `, now redirects to ${c.redirected}` : ""}): ${c.ids.map(link).join(", ")}`);
  lines.push("");
}
if (failed.length) {
  lines.push("## Source pages that could not be read", "", "The page may have moved or be down for a moment. Find the new address or another official source.", "");
  for (const f of failed) lines.push(`- [ ] ${f.url} (${f.error}): ${f.ids.map(link).join(", ")}`);
  lines.push("");
}
if (due.length) {
  lines.push(`## Tips due for review by ${inAMonth}`, "", "Check the sources, then set a new `review_by` date and `last_reviewed`.", "");
  for (const t of due) lines.push(`- [ ] ${link(t.id)}: review by ${t.data.review_by}${t.data.review_by < today ? " (overdue)" : ""}`);
  lines.push("");
}
writeFileSync(reportFile, lines.join("\n"));
console.log(lines.join("\n"));
