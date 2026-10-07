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

const hasNoCitation = (d) => d.verification.flags.some((f) => f.type === "no-citation");

// Cost bands from cheapest to dearest; the budget filter shows everything up to the chosen band.
const COSTS = ["none", "under-100", "100-2500", "2500-25000", "over-25000"];
const RUNGS = [1, 2, 3, 4, 5];
const DEFAULT_RUNG = 2;
// "Who are you?" options and the tips each one shows.
const WHO = {
  rent: (d) => d.audience.includes("tenant"),
  own: (d) => d.audience.includes("homeowner") || d.audience.includes("landlord"),
  build: (d) => d.stage.includes("renovating") || d.stage.includes("building-new"),
};
const TODAY = new Date().toISOString().slice(0, 10);
const isOverdue = (d) => d.stability === "variable" && d.review_by < TODAY;
const levelText = (n) => t("chip.level").replace("{n}", n).replace("{name}", label("rung", n));

// "{nocite}" after a sentence in a tip body marks it as not backed by any cited source.
const NOCITE = "{nocite}";
function renderBody(md) {
  const badge = `<span class="nocite-tag" title="${esc(t("nocite.title"))}">${esc(t("nocite.inline"))}</span>`;
  return marked.parse(md).split(NOCITE).join(badge);
}

function chips(d) {
  const out = [
    `<span class="chip cat">${esc(label("category", d.category))}</span>`,
    `<span class="chip level">${esc(levelText(d.rung))}</span>`,
    `<span class="chip">${esc(t("field.cost"))}: ${esc(label("cost", d.upfront_cost))}</span>`,
    `<span class="chip">${esc(label("time", d.time_needed))}</span>`,
    `<span class="chip ${d.stability}" title="${esc(t(`stability.${d.stability}`))}">${esc(label("stability", d.stability))}</span>`,
  ];
  if (isOverdue(d)) out.push(`<span class="chip warn">${esc(t("chip.overdue"))}</span>`);
  const s = savingsText(d.estimated_savings);
  if (s) out.push(`<span class="chip save">${esc(s)}</span>`);
  if (d.needs_landlord_permission) out.push(`<span class="chip warn">${esc(t("chip.landlord"))}</span>`);
  if (hasNoCitation(d)) out.push(`<span class="chip nocite">${esc(t("chip.nocite"))}</span>`);
  else if (d.verification.status !== "verified") out.push(`<span class="chip review">${esc(t("chip.review"))}</span>`);
  return out.join("");
}

function card(tip) {
  const d = tip.data;
  const l = localize(tip, LANG);
  const haystack = [l.title, l.summary, ...(d.tags || []), label("category", d.category)].join(" ").toLowerCase();
  const who = Object.keys(WHO).filter((w) => WHO[w](d)).join(" ");
  return `<li class="card" data-category="${esc(d.category)}" data-rung="${d.rung}" data-cost="${COSTS.indexOf(d.upfront_cost)}" data-who="${who}" data-stability="${d.stability}" data-landlord="${d.needs_landlord_permission}" data-cited="${d.verification.status === "verified"}" data-text="${esc(haystack)}">
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
  // Only offer "who are you" choices that have at least one tip yet.
  const whoOptions = Object.keys(WHO).filter((w) => tips.some((x) => WHO[w](x.data)));
  const body = `
<section class="intro">
  <h1>${esc(t("index.heading"))}</h1>
  <p>${esc(t("index.intro"))}</p>
</section>
<form class="filters" role="search" onsubmit="return false">
  <fieldset class="ladder" id="ladder">
    <legend>${esc(t("filter.level"))} <span class="hint">${esc(t("filter.levelHint"))}</span></legend>
    <div class="steps">${RUNGS.map((n) => `<label class="step">
      <input type="radio" name="rung" value="${n}"${n === DEFAULT_RUNG ? " checked" : ""}>
      <span><b>${n}</b> ${esc(label("rung", n))} <small>(${tips.filter((x) => x.data.rung === n).length})</small></span></label>`).join("")}</div>
  </fieldset>
  ${whoOptions.length > 1 ? `<fieldset class="who" id="who">
    <legend>${esc(t("filter.who"))}</legend>
    <div class="steps">${["all", ...whoOptions].map((w) => `<label class="step">
      <input type="radio" name="who" value="${w === "all" ? "" : w}"${w === "all" ? " checked" : ""}>
      <span>${esc(t(`who.${w}`))}</span></label>`).join("")}</div>
  </fieldset>` : ""}
  <label class="search"><span>${esc(t("filter.search"))}</span>
    <input type="search" id="q" placeholder="${esc(t("filter.searchPlaceholder"))}"></label>
  <label><span>${esc(t("filter.category"))}</span>
    <select id="category"><option value="">${esc(t("filter.all"))}</option>${options("category", cats)}</select></label>
  <label><span>${esc(t("filter.budget"))}</span>
    <select id="cost"><option value="">${esc(t("filter.all"))}</option>${COSTS.slice(0, -1).map((c, i) => `<option value="${i}">${esc(label("budget", c))}</option>`).join("")}</select></label>
  <label><span>${esc(t("filter.stability"))}</span>
    <select id="stability"><option value="">${esc(t("filter.all"))}</option>${options("stability", ["constant", "variable"])}</select></label>
  <label class="check"><input type="checkbox" id="nolandlord"> ${esc(t("filter.noLandlord"))}</label>
  <label class="check"><input type="checkbox" id="cited"> ${esc(t("filter.cited"))}</label>
</form>
<p class="count" id="count" aria-live="polite">${tips.length} ${esc(t("index.tips"))}</p>
<ul class="cards" id="cards">
${tips.map(card).join("\n")}
</ul>
<p class="empty" id="empty" hidden>${esc(t("index.empty"))}</p>
<p class="more" id="more" hidden data-one="${esc(t("index.more1"))}" data-many="${esc(t("index.moreN"))}"></p>`;
  return page({ title: t("site.name"), description: t("index.intro"), rel: "", path: "", body });
}

function tipPage(tip) {
  const d = tip.data;
  const l = localize(tip, LANG);
  const s = d.estimated_savings;
  const savings = savingsText(s);
  const facts = [
    [t("field.level"), levelText(d.rung)],
    [t("field.time"), label("time", d.time_needed)],
    [t("field.cost"), label("cost", d.upfront_cost)],
    [t("field.kind"), label("kind", d.kind)],
    // Variable tips explain themselves in the notice above the table.
    [t("field.stability"), d.stability === "constant"
      ? `<strong>${esc(label("stability", d.stability))}</strong> · ${esc(t("stability.constant"))}`
      : `<strong>${esc(label("stability", d.stability))}</strong>`],
    [t("field.savings"), `${savings ? `<strong>${esc(savings)}</strong> · ` : ""}${esc(l.basis)} <span class="muted">(${esc(t("field.confidence"))}: ${esc(label("confidence", s.confidence))})</span>`],
    [t("field.who"), label("responsibility", d.responsibility)],
    [t("field.landlord"), d.needs_landlord_permission ? t("yes") : t("no")],
  ].map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v.includes("<") ? v : esc(v)}</td></tr>`).join("");

  // Open points, uncited ones first, each labelled with its kind.
  const order = { "no-citation": 0, "secondary-source": 1, "to-verify": 2 };
  const points = d.verification.flags.map((f, i) => ({ type: f.type, note: l.flags[i] }))
    .sort((a, b) => order[a.type] - order[b.type]);
  const uncited = hasNoCitation(d);
  const review = d.verification.status !== "verified"
    ? `<aside class="notice ${uncited ? "nocite" : "review"}"><strong>${esc(t(uncited ? "tip.nociteHeading" : "tip.reviewHeading"))}</strong>
       <p>${esc(t(uncited ? "tip.nociteText" : "tip.reviewText"))}</p>
       <ul class="points">${points.map((p) => `<li><span class="flag ${p.type}">${esc(label("flag", p.type))}</span> ${esc(p.note)}</li>`).join("")}</ul></aside>`
    : "";

  // Variable tips depend on rules or prices that change: say so, with the next check date.
  const variable = d.stability === "variable"
    ? `<aside class="notice variable"><strong>${esc(t("tip.variableHeading"))}</strong>
       <p>${esc(t("stability.variable"))}</p>
       <p>${esc(t(isOverdue(d) ? "tip.overdue" : "tip.nextCheck").replace("{d}", d.review_by))}</p></aside>`
    : "";

  const pairs = (d.pairs_with || []).length
    ? `<section class="pairs"><h2>${esc(t("tip.pairs"))}</h2><ul>${d.pairs_with.map((id) =>
        `<li><a href="../${esc(id)}/">${esc(localize(byId.get(id), LANG).title)}</a></li>`).join("")}</ul></section>`
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
  ${variable}
  <table class="facts"><tbody>${facts}</tbody></table>
  <div class="prose">${renderBody(l.body)}</div>
  ${regionNotes}
  ${pairs}
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

// Easiest wins first: ladder rung, then cost, then title.
const tips = loadTips().sort((a, b) =>
  a.data.rung - b.data.rung ||
  COSTS.indexOf(a.data.upfront_cost) - COSTS.indexOf(b.data.upfront_cost) ||
  a.id.localeCompare(b.id));
const byId = new Map(tips.map((x) => [x.id, x]));

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
