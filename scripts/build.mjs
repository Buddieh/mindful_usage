// Builds the static site into dist/: an index with search and filters,
// one page per tip, and tips.json for anyone who wants the raw data.
import { mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";
import { loadTips, localize, ROOT } from "./tips.mjs";
import { t as tr, label as lb, LANGUAGES, DEFAULT_LANG } from "../src/i18n.mjs";

const DIST = join(ROOT, "dist");
// Set per language in the build loop at the bottom.
let LANG = DEFAULT_LANG;
const t = (key) => tr(LANG, key);
const label = (group, value) => lb(LANG, group, value);
// Set automatically in GitHub Actions; used for "suggest an edit" links.
const REPO = process.env.GITHUB_REPOSITORY;
const REPO_URL = REPO ? `https://github.com/${REPO}` : null;
const BRANCH = process.env.GITHUB_REF_NAME || "main";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function savingsText(s) {
  if (s.kind === "qualitative" || s.value == null) return null;
  return t(`savings.${s.kind}`).replace("{v}", s.value);
}

function page({ title, description, rel, path, body }) {
  // rel: from this page up to the language root; path: this page below the language root.
  const toggle = LANGUAGES.map((l) => l === LANG
    ? `<span aria-current="true">${l.toUpperCase()}</span>`
    : `<a href="${rel}../${l}/${path}" hreflang="${l}" lang="${l}" data-lang="${l}" title="${esc(tr(l, "lang.name"))}">${l.toUpperCase()}</a>`).join(`<span class="sep">|</span>`);
  const alternates = LANGUAGES.map((l) => `<link rel="alternate" hreflang="${l}" href="${rel}../${l}/${path}">`).join("\n");
  return `<!doctype html>
<html lang="${LANG}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="stylesheet" href="${rel}../style.css">
${alternates}
</head>
<body>
<header class="site-header"><div class="wrap">
  <a class="brand" href="${rel}">${esc(t("site.name"))}</a>
  <span class="tagline">${esc(t("site.tagline"))}</span>
  <nav class="lang" aria-label="${esc(t("lang.switch"))}">${toggle}</nav>
</div></header>
<main class="wrap">
${body}
</main>
<footer class="site-footer"><div class="wrap">
  <p>${t("footer.license")}${REPO_URL ? ` · <a href="${REPO_URL}">${esc(t("footer.source"))}</a>` : ""}</p>
  <p>${esc(t("footer.disclaimer"))}</p>
</div></footer>
<script src="${rel}../app.js"></script>
</body>
</html>
`;
}

function chips(d) {
  const out = [
    `<span class="chip cat">${esc(label("category", d.category))}</span>`,
    `<span class="chip">${esc(t("field.effort"))}: ${esc(label("effort", d.effort))}</span>`,
    `<span class="chip">${esc(t("field.cost"))}: ${esc(label("cost", d.upfront_cost))}</span>`,
  ];
  const s = savingsText(d.estimated_savings);
  if (s) out.push(`<span class="chip save">${esc(s)}</span>`);
  if (d.needs_landlord_permission) out.push(`<span class="chip warn">${esc(t("chip.landlord"))}</span>`);
  if (d.verification.status !== "verified") out.push(`<span class="chip review">${esc(t("chip.review"))}</span>`);
  return out.join("");
}

function card(tip) {
  const d = tip.data;
  const l = localize(tip, LANG);
  const haystack = [l.title, l.summary, ...(d.tags || []), label("category", d.category)].join(" ").toLowerCase();
  return `<li class="card" data-category="${esc(d.category)}" data-effort="${esc(d.effort)}" data-cost="${esc(d.upfront_cost)}" data-landlord="${d.needs_landlord_permission}" data-text="${esc(haystack)}">
  <a href="tips/${esc(tip.id)}/"><h2>${esc(l.title)}</h2></a>
  <p>${esc(l.summary)}</p>
  <div class="chips">${chips(d)}</div>
</li>`;
}

function options(group, values) {
  return values.map((v) => `<option value="${v}">${esc(label(group, v))}</option>`).join("");
}

function indexPage(tips) {
  const cats = [...new Set(tips.map((x) => x.data.category))].sort((a, b) =>
    label("category", a).localeCompare(label("category", b)));
  const body = `
<section class="intro">
  <h1>${esc(t("index.heading"))}</h1>
  <p>${esc(t("index.intro"))}</p>
</section>
<form class="filters" role="search" onsubmit="return false">
  <label class="search"><span>${esc(t("filter.search"))}</span>
    <input type="search" id="q" placeholder="${esc(t("filter.searchPlaceholder"))}"></label>
  <label><span>${esc(t("filter.category"))}</span>
    <select id="category"><option value="">${esc(t("filter.all"))}</option>${options("category", cats)}</select></label>
  <label><span>${esc(t("field.effort"))}</span>
    <select id="effort"><option value="">${esc(t("filter.all"))}</option>${options("effort", ["low", "medium", "high"])}</select></label>
  <label><span>${esc(t("field.cost"))}</span>
    <select id="cost"><option value="">${esc(t("filter.all"))}</option>${options("cost", ["none", "low", "medium", "high"])}</select></label>
  <label class="check"><input type="checkbox" id="nolandlord"> ${esc(t("filter.noLandlord"))}</label>
</form>
<p class="count" id="count" aria-live="polite">${tips.length} ${esc(t("index.tips"))}</p>
<ul class="cards" id="cards">
${tips.map(card).join("\n")}
</ul>
<p class="empty" id="empty" hidden>${esc(t("index.empty"))}</p>`;
  return page({ title: t("site.name"), description: t("index.intro"), rel: "", path: "", body });
}

function tipPage(tip) {
  const d = tip.data;
  const l = localize(tip, LANG);
  const s = d.estimated_savings;
  const savings = savingsText(s);
  const facts = [
    [t("field.effort"), label("effort", d.effort)],
    [t("field.cost"), label("cost", d.upfront_cost)],
    [t("field.savings"), `${savings ? `<strong>${esc(savings)}</strong> · ` : ""}${esc(l.basis)} <span class="muted">(${esc(t("field.confidence"))}: ${esc(label("confidence", s.confidence))})</span>`],
    [t("field.who"), label("responsibility", d.responsibility)],
    [t("field.landlord"), d.needs_landlord_permission ? t("yes") : t("no")],
  ].map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v.includes("<") ? v : esc(v)}</td></tr>`).join("");

  const review = d.verification.status !== "verified"
    ? `<aside class="notice review"><strong>${esc(t("tip.reviewHeading"))}</strong><p>${esc(t("tip.reviewText"))}</p>
       <ul>${l.flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></aside>`
    : "";

  const regionNotes = l.region_notes
    ? `<aside class="notice"><strong>${esc(t("tip.regionNotes"))}</strong><p>${esc(l.region_notes)}</p></aside>` : "";

  const sources = d.sources.map((src, i) => `<li>
    <a href="${esc(src.url)}" rel="noopener">${esc(src.title)}</a> <span class="muted">· ${esc(src.publisher)} (${esc(label("sourceType", src.type))})</span>
    ${l.supports[i] ? `<div class="src-meta">${esc(t("tip.supports"))}: ${esc(l.supports[i])}</div>` : ""}
    ${src.locator ? `<div class="src-meta">${esc(t("tip.locator"))}: ${esc(src.locator)}</div>` : ""}
    <div class="src-meta">${esc(t("tip.accessed"))} ${esc(src.accessed)}</div>
  </li>`).join("");

  const file = l.lang === d.lang ? tip.file : `${LANG}/${tip.file}`;
  const edit = REPO_URL
    ? `<p class="edit"><a href="${REPO_URL}/edit/${BRANCH}/content/tips/${esc(file)}">${esc(t("tip.edit"))}</a></p>` : "";

  const body = `
<p class="back"><a href="../../">← ${esc(t("tip.back"))}</a></p>
<article class="tip">
  <h1 lang="${l.lang}">${esc(l.title)}</h1>
  <p class="lead">${esc(l.summary)}</p>
  <div class="chips">${chips(d)}</div>
  ${review}
  <table class="facts"><tbody>${facts}</tbody></table>
  <div class="prose">${marked.parse(l.body)}</div>
  ${regionNotes}
  <section class="sources">
    <h2>${esc(t("tip.sources"))}</h2>
    <ol>${sources}</ol>
  </section>
  <p class="muted">${esc(t("tip.lastReviewed"))} ${esc(d.last_reviewed)}</p>
  ${edit}
</article>`;
  return page({ title: `${l.title} · ${t("site.name")}`, description: l.summary, rel: "../../", path: `tips/${tip.id}/`, body });
}

// The site root sends readers to their saved or browser language.
function rootRedirect() {
  return `<!doctype html>
<html lang="${DEFAULT_LANG}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tr(DEFAULT_LANG, "site.name"))}</title>
<noscript><meta http-equiv="refresh" content="0; url=${DEFAULT_LANG}/"></noscript>
<script>
  var langs = ${JSON.stringify(LANGUAGES)}, pick = "${DEFAULT_LANG}";
  try { var saved = localStorage.getItem("lang"); } catch (e) {}
  if (saved && langs.indexOf(saved) !== -1) pick = saved;
  else (navigator.languages || [navigator.language || ""]).some(function (l) {
    var c = String(l).slice(0, 2).toLowerCase();
    if (langs.indexOf(c) !== -1) { pick = c; return true; }
  });
  location.replace(pick + "/");
</script>
</head>
<body>${LANGUAGES.map((l) => `<a href="${l}/">${esc(tr(l, "lang.name"))}</a>`).join(" · ")}</body>
</html>
`;
}

// Easiest wins first: effort, then cost, then title.
const rank = { none: 0, low: 1, medium: 2, high: 3 };
const tips = loadTips().sort((a, b) =>
  rank[a.data.effort] - rank[b.data.effort] ||
  rank[a.data.upfront_cost] - rank[b.data.upfront_cost] ||
  a.id.localeCompare(b.id));

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
for (const lang of LANGUAGES) {
  LANG = lang;
  const out = join(DIST, lang);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "index.html"), indexPage(tips));
  for (const tip of tips) {
    mkdirSync(join(out, "tips", tip.id), { recursive: true });
    writeFileSync(join(out, "tips", tip.id, "index.html"), tipPage(tip));
  }
}
writeFileSync(join(DIST, "index.html"), rootRedirect());
writeFileSync(join(DIST, "tips.json"), JSON.stringify(tips.map((x) => ({
  ...x.data, body: x.body,
  translations: Object.fromEntries(Object.entries(x.translations).map(([l, v]) => [l, { ...v.data, body: v.body }])),
})), null, 2));
for (const f of ["style.css", "app.js"]) copyFileSync(join(ROOT, "src", f), join(DIST, f));
writeFileSync(join(DIST, ".nojekyll"), "");
console.log(`✓ built ${tips.length} tips in ${LANGUAGES.join(", ")} into dist/`);
