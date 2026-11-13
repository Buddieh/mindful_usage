// Reads every tip in content/tips (main files) and its translations in
// content/tips/<lang>/ (same file name).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import yaml from "js-yaml";

export const ROOT = new URL("..", import.meta.url).pathname;
export const TIPS_DIR = join(ROOT, "content", "tips");

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function readMarkdown(file) {
  const match = readFileSync(file, "utf8").match(FRONT_MATTER);
  if (!match) throw new Error(`${file}: missing YAML front matter`);
  // JSON_SCHEMA keeps dates such as 2026-10-07 as strings.
  return { data: yaml.load(match[1], { schema: yaml.JSON_SCHEMA }), body: match[2].trim() };
}

// Translation folders are the subfolders of content/tips, named by language code.
export function translationLangs() {
  return readdirSync(TIPS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

export function loadTips() {
  const langs = translationLangs();
  return readdirSync(TIPS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const { data, body } = readMarkdown(join(TIPS_DIR, f));
      const translations = {};
      for (const lang of langs) {
        const tf = join(TIPS_DIR, lang, f);
        if (existsSync(tf)) translations[lang] = { file: `${lang}/${f}`, ...readMarkdown(tf) };
      }
      return { id: basename(f, ".md"), file: f, data, body, translations };
    });
}

// The reader-facing text of a tip in one language, falling back to the main file.
export function localize(tip, lang) {
  const d = tip.data;
  const tr = d.lang === lang ? null : tip.translations[lang];
  if (!tr) return { lang: d.lang, title: d.title, summary: d.summary, basis: d.estimated_savings.basis, impact_basis: d.impact.basis,
    region_notes: d.region_notes, flags: d.verification.flags.map((f) => f.note), supports: d.sources.map((s) => s.supports || ""), body: tip.body };
  const t = tr.data;
  return { lang, title: t.title, summary: t.summary, basis: t.savings_basis, impact_basis: t.impact_basis, region_notes: t.region_notes,
    flags: t.flags || [], supports: t.supports || d.sources.map(() => ""), body: tr.body };
}

// Tips arrive through public pull requests, so a link in a tip body may only point to a relative
// path or an http(s)/mailto address. Anything before the first / ? # that could hide a scheme
// (entities, %-escapes, whitespace) makes the link unsafe.
export function safeHref(href) {
  const head = String(href || "").split(/[/?#]/)[0];
  if (/[&%\s\x00-\x1f\\]/.test(head)) return false;
  const i = head.indexOf(":");
  return i < 0 || /^(https?|mailto)$/i.test(head.slice(0, i));
}
